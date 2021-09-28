import { readFileSync } from "fs";
import mcData from "minecraft-data";
import { createBot } from "mineflayer";
import { Item } from "prismarine-item"
import { exit } from "process";
import readline from "readline";

const config = JSON.parse(readFileSync("config.json", "utf-8"));

const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})
 
async function getInput(question: string): Promise<string> {
    return new Promise((resolve) => input.question(question, resolve));
}

const username = await getInput("Enter your email: ");
const password = await getInput("Enter your password: ");

const authInput = await getInput("Enter the auth type [mojang: 1, microsoft: 2] (1): ");
const auth = !authInput || authInput === "1" ? "mojang" : "microsoft";

const bot = createBot({
    host: config.host,
    username: username,
    password: password,
    port: config.port,
    auth: auth
});

let data: mcData.IndexedData;
let shulkers: string[];
bot.once("spawn", () => {
    data = mcData(bot.version);
    shulkers = data.itemsArray
        .filter((item) => /^.*_shulker_box/.test(item.name))
        .map((item) => item.name);
});

function isShulker(item: Item): boolean {
    return shulkers.includes(item.name);
}

let queue: Set<string> = new Set();
let cooldownMap: Map<string, number> = new Map();
let isDelivering = false;
bot.on("chat", async (username, message) => {
    if (!isDelivering && message.startsWith("-kit")) {
        if (cooldownMap.get(username)) {
            bot.chat(`/w ${username} You are on cooldown, try again later`);
            return;
        }

        isDelivering = true;
        // Minutes
        const min = 5;
        const max = 10;
        cooldownMap.set(username, Math.round(Math.random() * (max - min) + min));
        bot.chat(`/w ${username} Getting kit, please wait`);
        const chestBlock = bot.findBlock({
            matching: data.blocksByName["chest"].id,
            maxDistance: 5
        });

        if (chestBlock) {
            const chest = await bot.openChest(chestBlock);

            const containedShulkers = bot.currentWindow!.containerItems().filter(isShulker);
            if (!containedShulkers.length) {
                chest.close();
                bot.chat(`/w ${username} I am out of kits, try again later`);
                return;
            }

            await chest.withdraw(containedShulkers[0].type, null, 1);
            chest.close();
            bot.chat(`/w ${username} Starting delivery now, accept tpa`);
            bot.chat(`/tpa ${username}`);
            queue.add(username);
        } else {
            bot.chat(`/w ${username} My operator put me in the wrong place, i do not have access to a chest`);
        }
    }
});

bot.on("message", async (message, position) => {
    if (position === "system") {
        const messageStr = message.valueOf();
        for (const member of queue) {
            if (messageStr === config.timeoutMessage.replace(/%s/g, member) 
                || messageStr === config.deniedMessage.replace(/%s/g, member)) {
                queue.delete(member);

                const hopperBlock = bot.findBlock({
                    matching: data.blocksByName["hopper"].id,
                    maxDistance: 5
                });

                if (hopperBlock) {
                    const hopper = await bot.openChest(hopperBlock);
                    const shulker = bot.inventory.items().filter(isShulker)[0];
                    await hopper.deposit(shulker.type, null, 1, (err) => {
                        if (err) {
                            console.error(err);
                        }
                    });
                    hopper.close();
                } else {
                    console.error("I do not have a hopper!");
                    bot.end();
                    exit(1);
                }

                isDelivering = false;
                break;
            }
        }
    }
});

bot.on("forcedMove", async () => {
    if (bot.inventory.items().length) {
        await bot.tossStack(bot.inventory.items()[0]);
        const player = bot.nearestEntity((entity) => entity.type === "player")?.username ?? "";
        queue.delete(player);
        bot.chat(`/w ${player} Kit delivered`);
        bot.chat("/kill");
        isDelivering = false;
    }
});

setInterval(() => {
    for (const [name, cooldown] of cooldownMap.entries()) {
        if (cooldown - 1 <= 0) {
            cooldownMap.delete(name);
            return;
        }
        cooldownMap.set(name, cooldown - 1);
    }
}, 60000);

while (true) {
    const command = await getInput("");

    switch (command) {
        case "disconnect":
            bot.end();
            exit(0);
        case "kill":
            bot.chat("/kill");
            break;
        default:
            console.error("Invalid command");
    }
}