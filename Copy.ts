import { copyFile, unlinkSync, existsSync } from "fs";
import { exit } from "process";

const dest = "dist/config.json";
if (existsSync(dest)) {
    unlinkSync(dest);
}

copyFile("config.json", dest, (err) => {
    if (err) {
        console.error(`Failed to copy config file, aborting ${err}`);
        exit(1);
    }
});