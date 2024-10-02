// browser_database.js

class BrowserDatabase {
    constructor() {
      this.db = null;
      this.dbName = "PastelInferenceClientDB";
      this.dbVersion = 1;
    }
  
    async initializeDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
  
        request.onerror = (event) => {
          console.error("Error opening database:", event.target.error);
          reject(event.target.error);
        };
  
        request.onsuccess = (event) => {
          this.db = event.target.result;
          console.log("Database opened successfully");
          resolve();
        };
  
        request.onupgradeneeded = (event) => {
          this.db = event.target.result;
          this.createObjectStores(this.db);
        };
      });
    }
  
    createObjectStores(db) {
      const storeNames = [
        "SupernodeList",
        "Message",
        "UserMessage",
        "CreditPackPurchaseRequest",
        "CreditPackPurchaseRequestRejection",
        "CreditPackPurchaseRequestPreliminaryPriceQuote",
        "CreditPackPurchaseRequestPreliminaryPriceQuoteResponse",
        "CreditPackPurchaseRequestResponseTermination",
        "CreditPackPurchaseRequestResponse",
        "CreditPackPurchaseRequestConfirmation",
        "CreditPackPurchaseRequestConfirmationResponse",
        "CreditPackRequestStatusCheck",
        "CreditPackPurchaseRequestStatus",
        "CreditPackStorageRetryRequest",
        "CreditPackStorageRetryRequestResponse",
        "InferenceAPIUsageRequest",
        "InferenceAPIUsageResponse",
        "InferenceAPIOutputResult",
        "InferenceConfirmation"
      ];
  
      storeNames.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
          
          // Add indexes based on the original Sequelize models
          switch (storeName) {
            case "SupernodeList":
              store.createIndex("txid_vout", "txid_vout", { unique: false });
              store.createIndex("supernode_psl_address", "supernode_psl_address", { unique: false });
              break;
            case "CreditPackPurchaseRequest":
              store.createIndex("sha3_256_hash_of_credit_pack_purchase_request_fields", "sha3_256_hash_of_credit_pack_purchase_request_fields", { unique: true });
              break;
            case "CreditPackPurchaseRequestResponse":
              store.createIndex("sha3_256_hash_of_credit_pack_purchase_request_response_fields", "sha3_256_hash_of_credit_pack_purchase_request_response_fields", { unique: true });
              break;
            case "CreditPackPurchaseRequestConfirmation":
              store.createIndex("sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields", "sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields", { unique: true });
              break;
            case "CreditPackPurchaseRequestConfirmationResponse":
              store.createIndex("sha3_256_hash_of_credit_pack_purchase_request_confirmation_response_fields", "sha3_256_hash_of_credit_pack_purchase_request_confirmation_response_fields", { unique: true });
              break;
            case "CreditPackPurchaseRequestStatus":
              store.createIndex("sha3_256_hash_of_credit_pack_purchase_request_status_fields", "sha3_256_hash_of_credit_pack_purchase_request_status_fields", { unique: true });
              break;
            case "InferenceAPIUsageRequest":
              store.createIndex("inference_request_id", "inference_request_id", { unique: true });
              break;
            case "InferenceAPIUsageResponse":
              store.createIndex("inference_response_id", "inference_response_id", { unique: true });
              break;
            case "InferenceAPIOutputResult":
              store.createIndex("inference_result_id", "inference_result_id", { unique: true });
              break;
          }
        }
      });
    }
  
    async addData(storeName, data) {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.add(data);
  
        request.onerror = (event) => {
          reject(event.target.error);
        };
  
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
      });
    }
  
    async getData(storeName, id) {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
  
        request.onerror = (event) => {
          reject(event.target.error);
        };
  
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
      });
    }
  
    async updateData(storeName, id, data) {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put({ ...data, id });
  
        request.onerror = (event) => {
          reject(event.target.error);
        };
  
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
      });
    }
  
    async deleteData(storeName, id) {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
  
        request.onerror = (event) => {
          reject(event.target.error);
        };
  
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
      });
    }
  
    async getAllData(storeName) {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
  
        request.onerror = (event) => {
          reject(event.target.error);
        };
  
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
      });
    }
  
    async findByIndex(storeName, indexName, value) {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.get(value);
  
        request.onerror = (event) => {
          reject(event.target.error);
        };
  
        request.onsuccess = (event) => {
          resolve(event.target.result);
        };
      });
    }
  }
  
  // Create instances for each model
  const models = {
    SupernodeList: {},
    Message: {},
    UserMessage: {},
    CreditPackPurchaseRequest: {},
    CreditPackPurchaseRequestRejection: {},
    CreditPackPurchaseRequestPreliminaryPriceQuote: {},
    CreditPackPurchaseRequestPreliminaryPriceQuoteResponse: {},
    CreditPackPurchaseRequestResponseTermination: {},
    CreditPackPurchaseRequestResponse: {},
    CreditPackPurchaseRequestConfirmation: {},
    CreditPackPurchaseRequestConfirmationResponse: {},
    CreditPackRequestStatusCheck: {},
    CreditPackPurchaseRequestStatus: {},
    CreditPackStorageRetryRequest: {},
    CreditPackStorageRetryRequestResponse: {},
    InferenceAPIUsageRequest: {},
    InferenceAPIUsageResponse: {},
    InferenceAPIOutputResult: {},
    InferenceConfirmation: {}
  };
  
  const browserDB = new BrowserDatabase();
  
  // Initialize the database
  async function initializeDatabase() {
    try {
      await browserDB.initializeDatabase();
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Failed to initialize database:", error);
    }
  }
  
  // Create methods for each model to interact with the database
  Object.keys(models).forEach(modelName => {
    models[modelName] = {
      create: async (data) => await browserDB.addData(modelName, data),
      findByPk: async (id) => await browserDB.getData(modelName, id),
      update: async (data, id) => await browserDB.updateData(modelName, id, data),
      destroy: async (id) => await browserDB.deleteData(modelName, id),
      findAll: async () => await browserDB.getAllData(modelName),
      findOne: async (options) => {
        if (options.where) {
          const [key, value] = Object.entries(options.where)[0];
          return await browserDB.findByIndex(modelName, key, value);
        }
        return null;
      }
    };
  });
  
  // Utility function to generate UUID
  function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // Export all models and the initializeDatabase function
  export {
    models,
    initializeDatabase,
    uuidv4
  };