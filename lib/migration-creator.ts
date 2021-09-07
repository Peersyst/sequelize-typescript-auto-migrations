import  { Sequelize } from "sequelize";
import {existsSync, readFileSync, writeFileSync} from "fs";
import path from "path";
import {getMigration, parseDifference, reverseModels, sortActions, writeMigration} from "./migrate";
import _, {each} from "lodash";

export interface CreateOptions {
    name: string,
    comment?: string,
    migrationsDirectory: string,
    sequelize: Sequelize,
    logger?: (msg: string) => void,
}

export const MigrationCreator = async (options: CreateOptions): Promise<void> => {
    // current state
    const currentState = {
        tables: {},
        revision: null,
    };

    // load last state
    let previousState = {
        revision: 0,
        version: 1,
        tables: {},
    };

    try {
        previousState = JSON.parse(readFileSync(path.join(options.migrationsDirectory, "_current.json")).toString());
    } catch (e) {
        options.logger && options.logger("No previous state found");
    }

    const sequelize = options.sequelize;

    let models = sequelize.models;

    currentState.tables = reverseModels(sequelize, models);

    const unsortedActionsUp = parseDifference(_.cloneDeep(previousState.tables), _.cloneDeep(currentState.tables));
    const actionsUp = sortActions(unsortedActionsUp);
    const migrationUp = getMigration(actionsUp);

    if (migrationUp.commands.length === 0) {
        options.logger && options.logger("No changes found");
        return;
    }

    const unsortedActionsDown = parseDifference(_.cloneDeep(currentState.tables), _.cloneDeep(previousState.tables));
    const actionsDown = sortActions(unsortedActionsDown);
    const migrationDown = getMigration(actionsDown);

    // log migration actions
    each(migrationUp.consoleOut, (v) => {
        options.logger && options.logger("[Actions up] " + v);
    });
    each(migrationDown.consoleOut, (v) => {
        options.logger && options.logger("[Actions down] " + v);
    });

    // backup _current file
    if (existsSync(path.join(options.migrationsDirectory, "_current.json"))) {
        writeFileSync(
            path.join(options.migrationsDirectory, "_current_bak.json"),
            readFileSync(path.join(options.migrationsDirectory, "_current.json"))
        );
    }

    // save current state
    currentState.revision = previousState.revision + 1;
    writeFileSync(
        path.join(options.migrationsDirectory, "_current.json"),
        JSON.stringify(currentState, null, 4)
    );

    // write migration to file
    const info = writeMigration(
        currentState.revision.toString().padStart(4, "0"),
        migrationUp,
        migrationDown,
        options.migrationsDirectory,
        options.name,
        options.comment ? options.comment : ""
    );

    options.logger && options.logger(
        `New migration to revision ${currentState.revision} has been saved to file '${info.filename}'`
    );
}
