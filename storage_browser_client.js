// browser_storage.js

import { BrowserRPCReplacement } from "./BrowserRPCReplacement.js";
import { BrowserDatabase } from "./BrowserDatabase.js";

// Simulating the logger functionality
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`),
};

// Simulating the globals
const globals = {
  MAX_CHARACTERS_TO_DISPLAY_IN_ERROR_MESSAGE: 100,
};

class BrowserStorage {
  constructor() {
    this.browserDB = new BrowserDatabase();
    this.rpcReplacement = new BrowserRPCReplacement();
    this.storageInitialized = false;
  }

  async initializeStorage() {
    if (!this.storageInitialized) {
      try {
        await this.browserDB.initializeDatabase();
        logger.info("Storage initialized successfully");
        this.storageInitialized = true;
      } catch (error) {
        logger.error(
          `Error initializing storage: ${error.message.slice(
            0,
            globals.MAX_CHARACTERS_TO_DISPLAY_IN_ERROR_MESSAGE
          )}`
        );
        throw error;
      }
    }
  }

  async getCurrentPastelIdAndPassphrase() {
    try {
      await this.initializeStorage();
      const pastelID = localStorage.getItem("MY_LOCAL_PASTELID");
      const passphrase = localStorage.getItem("MY_PASTELID_PASSPHRASE");

      if (!pastelID || !passphrase) {
        logger.warn("PastelID or passphrase not found in storage");
        return { pastelID: null, passphrase: null };
      }

      logger.info(`Retrieved PastelID from storage: ${pastelID}`);
      return { pastelID, passphrase };
    } catch (error) {
      logger.error(
        `Error retrieving PastelID and passphrase: ${error.message.slice(
          0,
          globals.MAX_CHARACTERS_TO_DISPLAY_IN_ERROR_MESSAGE
        )}`
      );
      return { pastelID: null, passphrase: null };
    }
  }

  async setPastelIdAndPassphrase(pastelID, passphrase) {
    if (!pastelID || !passphrase) {
      logger.error("Attempted to set empty PastelID or passphrase");
      throw new Error("PastelID and passphrase must not be empty");
    }

    try {
      await this.initializeStorage();
      localStorage.setItem("MY_LOCAL_PASTELID", pastelID);
      localStorage.setItem("MY_PASTELID_PASSPHRASE", passphrase);
      logger.info(`Set PastelID: ${pastelID}`);
    } catch (error) {
      logger.error(
        `Error setting PastelID and passphrase: ${error.message.slice(
          0,
          globals.MAX_CHARACTERS_TO_DISPLAY_IN_ERROR_MESSAGE
        )}`
      );
      throw error;
    }
  }

  // Additional methods to interact with BrowserDatabase
  async storeData(storeName, data) {
    await this.initializeStorage();
    return this.browserDB.addData(storeName, data);
  }

  async retrieveData(storeName, id) {
    await this.initializeStorage();
    return this.browserDB.getData(storeName, id);
  }

  async updateData(storeName, id, data) {
    await this.initializeStorage();
    return this.browserDB.updateData(storeName, id, data);
  }

  async deleteData(storeName, id) {
    await this.initializeStorage();
    return this.browserDB.deleteData(storeName, id);
  }

  // Method to interact with BrowserRPCReplacement
  async performRPCOperation(method, ...args) {
    return this.rpcReplacement[method](...args);
  }
}

// Create and export a singleton instance
const browserStorage = new BrowserStorage();

export default browserStorage;
