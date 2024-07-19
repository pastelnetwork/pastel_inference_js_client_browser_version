const SupernodeList = new PouchDB('SupernodeList');
const Message = new PouchDB('Message');
const UserMessage = new PouchDB('UserMessage');
const CreditPackPurchaseRequest = new PouchDB('CreditPackPurchaseRequest');
const CreditPackPurchaseRequestRejection = new PouchDB('CreditPackPurchaseRequestRejection');
const CreditPackPurchaseRequestPreliminaryPriceQuote = new PouchDB('CreditPackPurchaseRequestPreliminaryPriceQuote');
const CreditPackPurchaseRequestPreliminaryPriceQuoteResponse = new PouchDB('CreditPackPurchaseRequestPreliminaryPriceQuoteResponse');
const CreditPackPurchaseRequestResponseTermination = new PouchDB('CreditPackPurchaseRequestResponseTermination');
const CreditPackPurchaseRequestResponse = new PouchDB('CreditPackPurchaseRequestResponse');
const CreditPackPurchaseRequestConfirmation = new PouchDB('CreditPackPurchaseRequestConfirmation');
const CreditPackPurchaseRequestConfirmationResponse = new PouchDB('CreditPackPurchaseRequestConfirmationResponse');
const CreditPackRequestStatusCheck = new PouchDB('CreditPackRequestStatusCheck');
const CreditPackPurchaseRequestStatus = new PouchDB('CreditPackPurchaseRequestStatus');
const CreditPackStorageRetryRequest = new PouchDB('CreditPackStorageRetryRequest');
const CreditPackStorageRetryRequestResponse = new PouchDB('CreditPackStorageRetryRequestResponse');
const InferenceAPIUsageRequest = new PouchDB('InferenceAPIUsageRequest');
const InferenceAPIUsageResponse = new PouchDB('InferenceAPIUsageResponse');
const InferenceAPIOutputResult = new PouchDB('InferenceAPIOutputResult');
const InferenceConfirmation = new PouchDB('InferenceConfirmation');