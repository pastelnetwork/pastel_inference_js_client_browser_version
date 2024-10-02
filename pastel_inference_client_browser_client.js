// browser_pastel_inference_client.js

import { BrowserRPCReplacement } from "./BrowserRPCReplacement.js";
import { BrowserDatabase } from "./BrowserDatabase.js";
import * as storage from "./storage_browser_client.js";
import * as utils from "./utility_functions_browser_replacements.js";
import * as schemas from "./validation_schemas_browser_client.js";

const rpc = new BrowserRPCReplacement();
const db = new BrowserDatabase();

// Simulating the logger functionality
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`),
};

// Constants
const TARGET_VALUE_PER_CREDIT_IN_USD = parseFloat(
  localStorage.getItem("TARGET_VALUE_PER_CREDIT_IN_USD") || "0.01"
);
const TARGET_PROFIT_MARGIN = parseFloat(
  localStorage.getItem("TARGET_PROFIT_MARGIN") || "0.1"
);
const MAXIMUM_LOCAL_CREDIT_PRICE_DIFFERENCE_TO_ACCEPT_CREDIT_PRICING =
  parseFloat(
    localStorage.getItem(
      "MAXIMUM_LOCAL_CREDIT_PRICE_DIFFERENCE_TO_ACCEPT_CREDIT_PRICING"
    ) || "0.001"
  );
const MAXIMUM_LOCAL_PASTEL_BLOCK_HEIGHT_DIFFERENCE_IN_BLOCKS = parseInt(
  localStorage.getItem(
    "MAXIMUM_LOCAL_PASTEL_BLOCK_HEIGHT_DIFFERENCE_IN_BLOCKS"
  ) || "10"
);
const MESSAGING_TIMEOUT_IN_SECONDS = parseInt(
  localStorage.getItem("MESSAGING_TIMEOUT_IN_SECONDS") || "30"
);

function getIsoStringWithMicroseconds() {
  const now = new Date();
  return now.toISOString().replace("Z", "+00:00").replace(/\s/g, "");
}

class PastelInferenceClient {
  constructor(pastelID, passphrase) {
    this.pastelID = pastelID;
    this.passphrase = passphrase;
  }

  async requestAndSignChallenge(supernodeURL) {
    try {
      const response = await fetch(
        `${supernodeURL}/request_challenge/${this.pastelID}`
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const { challenge, challenge_id } = await response.json();
      const challenge_signature = await rpc.signMessageWithPastelID(
        this.pastelID,
        challenge,
        this.passphrase
      );
      return {
        challenge,
        challenge_id,
        challenge_signature,
      };
    } catch (error) {
      logger.error(
        `Error requesting and signing challenge: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async sendUserMessage(supernodeURL, userMessage) {
    try {
      const { error } = await schemas.userMessageSchema.validate(userMessage);
      if (error) {
        throw new Error(`Invalid user message: ${error.message}`);
      }
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);

      const payload = userMessage;
      const response = await fetch(`${supernodeURL}/send_user_message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: payload,
          challenge,
          challenge_id,
          challenge_signature,
        }),
      });
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      const { resultError, value: validatedResult } =
        await schemas.userMessageSchema.validate(result);
      if (resultError) {
        throw new Error(`Invalid user message: ${resultError.message}`);
      }
      await db.addData("UserMessage", validatedResult);
      return validatedResult;
    } catch (error) {
      logger.error(`Error sending user message: ${error.message}`);
      throw error;
    }
  }

  async getUserMessages(supernodeURL) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const params = new URLSearchParams({
        pastelid: this.pastelID,
        challenge,
        challenge_id,
        challenge_signature,
      });
      const response = await fetch(
        `${supernodeURL}/get_user_messages?${params}`
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      const validatedResults = await Promise.all(
        result.map((messageData) =>
          schemas.userMessageSchema.validate(messageData)
        )
      );
      await Promise.all(
        validatedResults.map((message) => db.addData("UserMessage", message))
      );
      return validatedResults;
    } catch (error) {
      logger.error(`Error retrieving user messages: ${error.message}`);
      throw error;
    }
  }

  async getModelMenu() {
    const minimumNumberOfResponses = 5;
    const retryLimit = 1;
    try {
      const { validMasternodeListFullDF } = await rpc.checkSupernodeList();
      const closestSupernodes = await utils.getNClosestSupernodesToPastelIDURLs(
        60,
        this.pastelID,
        validMasternodeListFullDF
      );
      let validResponses = [];

      await new Promise((resolve, reject) => {
        let completedRequests = 0;
        closestSupernodes.forEach(({ url }) => {
          this.retryPromise(
            () => this.getModelMenuFromSupernode(url),
            retryLimit
          )
            .then((response) => {
              logger.info(
                `Successful model menu response received from supernode at ${url}`
              );
              validResponses.push({ response, url });
              if (validResponses.length >= minimumNumberOfResponses) {
                resolve();
              }
            })
            .catch((error) => {
              logger.error(
                `Error querying supernode at ${url}: ${error.message}`
              );
              completedRequests++;
              if (
                completedRequests >
                closestSupernodes.length -
                  minimumNumberOfResponses +
                  validResponses.length
              ) {
                reject(
                  new Error(
                    "Insufficient valid responses received from supernodes"
                  )
                );
              }
            });
        });
      });

      const largestResponse = validResponses.reduce((prev, current) => {
        return JSON.stringify(current.response).length >
          JSON.stringify(prev.response).length
          ? current
          : prev;
      }).response;

      return largestResponse;
    } catch (error) {
      logger.error(`Error in getModelMenu: ${error.message}`);
      throw error;
    }
  }

  async getModelMenuFromSupernode(supernodeURL) {
    try {
      const response = await fetch(`${supernodeURL}/get_inference_model_menu`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async retryPromise(promiseFunc, limit, count = 0) {
    try {
      return await promiseFunc();
    } catch (error) {
      if (count < limit) {
        return this.retryPromise(promiseFunc, limit, count + 1);
      } else {
        throw error;
      }
    }
  }

  async getValidCreditPackTicketsForPastelID(supernodeURL) {
    const useVerbose = false;
    try {
      if (!this.pastelID) {
        return [];
      }
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const payload = {
        pastelid: this.pastelID,
        challenge,
        challenge_id,
        challenge_signature,
      };
      if (useVerbose) {
        utils.logActionWithPayload(
          "retrieving",
          "valid credit pack tickets for PastelID",
          payload
        );
      }
      const response = await fetch(
        `${supernodeURL}/get_valid_credit_pack_tickets_for_pastelid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        if (useVerbose) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return [];
      }
      const validCreditPackTickets = await response.json();
      if (useVerbose && validCreditPackTickets.length) {
        logger.info(
          `Received ${validCreditPackTickets.length} valid credit pack tickets for PastelID ${this.pastelID}`
        );
      }

      const processedTickets = validCreditPackTickets.map((ticket) => ({
        credit_pack_registration_txid: ticket.credit_pack_registration_txid,
        credit_purchase_request_confirmation_pastel_block_height:
          ticket.credit_purchase_request_confirmation_pastel_block_height,
        requesting_end_user_pastelid: ticket.requesting_end_user_pastelid,
        ticket_input_data_fully_parsed_sha3_256_hash:
          ticket.ticket_input_data_fully_parsed_sha3_256_hash,
        txid_of_credit_purchase_burn_transaction:
          ticket.txid_of_credit_purchase_burn_transaction,
        credit_usage_tracking_psl_address:
          ticket.credit_usage_tracking_psl_address,
        psl_cost_per_credit: ticket.psl_cost_per_credit,
        requested_initial_credits_in_credit_pack:
          ticket.requested_initial_credits_in_credit_pack,
        credit_pack_current_credit_balance:
          ticket.credit_pack_current_credit_balance,
        balance_as_of_datetime: ticket.balance_as_of_datetime,
        number_of_confirmation_transactions:
          ticket.number_of_confirmation_transactions,
      }));

      return processedTickets;
    } catch (error) {
      if (useVerbose) {
        logger.error(
          `Error retrieving valid credit pack tickets for PastelID: ${error.message}`
        );
      }
      if (useVerbose) {
        throw error;
      }
      return [];
    }
  }

  async checkCreditPackBalance(supernodeURL, txid) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const payload = {
        credit_pack_ticket_txid: txid,
        challenge,
        challenge_id,
        challenge_signature,
      };
      utils.logActionWithPayload("checking", "credit pack balance", payload);

      const response = await fetch(
        `${supernodeURL}/check_credit_pack_balance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const balanceInfo = await response.json();
      logger.info(
        `Received credit pack balance info for txid ${txid}: ${JSON.stringify(
          balanceInfo
        )}`
      );
      return balanceInfo;
    } catch (error) {
      logger.error(
        `Error checking credit pack balance for txid ${txid}: ${error.message}`
      );
      throw error;
    }
  }

  async getCreditPackTicketFromTxid(supernodeURL, txid) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const params = new URLSearchParams({
        txid,
        pastelid: this.pastelID,
        challenge,
        challenge_id,
        challenge_signature,
      });
      utils.logActionWithPayload(
        "retrieving",
        "credit pack ticket from txid",
        params
      );

      const response = await fetch(
        `${supernodeURL}/get_credit_pack_ticket_from_txid?${params}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const {
        credit_pack_purchase_request_response,
        credit_pack_purchase_request_confirmation,
      } = await response.json();

      utils.logActionWithPayload(
        "received",
        "credit pack ticket from Supernode",
        {
          credit_pack_purchase_request_response,
          credit_pack_purchase_request_confirmation,
        }
      );

      const { errorRequestResponse, value: validatedRequestResponse } =
        await schemas.creditPackPurchaseRequestResponseSchema.validate(
          credit_pack_purchase_request_response
        );
      if (errorRequestResponse) {
        throw new Error(
          `Invalid credit pack request response: ${errorRequestResponse.message}`
        );
      }
      const { errorRequestConfirmation, value: validatedRequestConfirmation } =
        await schemas.creditPackPurchaseRequestConfirmationSchema.validate(
          credit_pack_purchase_request_confirmation
        );
      if (errorRequestConfirmation) {
        throw new Error(
          `Invalid credit pack request confirmation: ${errorRequestConfirmation.message}`
        );
      }
      return {
        creditPackPurchaseRequestResponse: validatedRequestResponse,
        creditPackPurchaseRequestConfirmation: validatedRequestConfirmation,
      };
    } catch (error) {
      logger.error(
        `Error retrieving credit pack ticket from txid: ${error.message}`
      );
      throw error;
    }
  }

  async creditPackTicketInitialPurchaseRequest(
    supernodeURL,
    creditPackRequest
  ) {
    try {
      const { error, value: validatedCreditPackRequest } =
        await schemas.creditPackPurchaseRequestSchema.validate(
          creditPackRequest
        );
      if (error) {
        throw new Error(`Invalid credit pack request: ${error.message}`);
      }
      await db.addData("CreditPackPurchaseRequest", validatedCreditPackRequest);
      utils.logActionWithPayload(
        "requesting",
        "a new Pastel credit pack ticket",
        validatedCreditPackRequest
      );
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      let preparedCreditPackRequest = await utils.prepareModelForEndpoint(
        creditPackRequest
      );
      const response = await fetch(
        `${supernodeURL}/credit_purchase_initial_request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challenge,
            challenge_id,
            challenge_signature,
            credit_pack_request: preparedCreditPackRequest,
          }),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();

      if (result.rejection_reason_string) {
        logger.error(
          `Credit pack purchase request rejected: ${result.rejection_reason_string}`
        );
        let rejectionResponse = await utils.prepareModelForValidation(result);
        const { rejectionError, value: validatedRejection } =
          await schemas.creditPackPurchaseRequestRejectionSchema.validate(
            rejectionResponse
          );
        if (rejectionError) {
          throw new Error(
            `Invalid credit pack purchase request rejection: ${rejectionError.message}`
          );
        }
        await db.addData(
          "CreditPackPurchaseRequestRejection",
          validatedRejection
        );
        return validatedRejection;
      } else {
        utils.logActionWithPayload(
          "receiving",
          "response to credit pack purchase request",
          result
        );
        let preparedResult = await utils.prepareModelForValidation(result);
        const { priceQuoteError, value: validatedPriceQuote } =
          await schemas.creditPackPurchaseRequestPreliminaryPriceQuoteSchema.validate(
            preparedResult
          );
        if (priceQuoteError) {
          throw new Error(
            "Invalid credit pack request: " + priceQuoteError.message
          );
        }
        await db.addData(
          "CreditPackPurchaseRequestPreliminaryPriceQuote",
          validatedPriceQuote
        );
        return validatedPriceQuote;
      }
    } catch (error) {
      logger.error(
        `Error initiating credit pack ticket purchase: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async calculatePriceDifferencePercentage(quotedPrice, estimatedPrice) {
    if (estimatedPrice === 0) {
      throw new Error("Estimated price cannot be zero.");
    }
    const differencePercentage =
      Math.abs(quotedPrice - estimatedPrice) / estimatedPrice;
    return differencePercentage;
  }

  async confirmPreliminaryPriceQuote(
    preliminaryPriceQuote,
    maximumTotalCreditPackPriceInPSL,
    maximumPerCreditPriceInPSL
  ) {
    if (!maximumTotalCreditPackPriceInPSL && !maximumPerCreditPriceInPSL) {
      maximumPerCreditPriceInPSL = parseFloat(
        localStorage.getItem("MAXIMUM_PER_CREDIT_PRICE_IN_PSL_FOR_CLIENT") ||
          "0.1"
      );
    }
    const {
      preliminary_quoted_price_per_credit_in_psl: quotedPricePerCredit,
      preliminary_total_cost_of_credit_pack_in_psl: quotedTotalPrice,
      credit_pack_purchase_request_fields_json_b64: requestFieldsB64,
    } = preliminaryPriceQuote;
    let requestFields = JSON.parse(atob(requestFieldsB64));
    const { requested_initial_credits_in_credit_pack: requestedCredits } =
      requestFields;
    if (!maximumTotalCreditPackPriceInPSL) {
      maximumTotalCreditPackPriceInPSL =
        maximumPerCreditPriceInPSL * requestedCredits;
    } else if (!maximumPerCreditPriceInPSL) {
      maximumPerCreditPriceInPSL =
        maximumTotalCreditPackPriceInPSL / requestedCredits;
    }
    const estimatedPricePerCredit =
      await utils.estimatedMarketPriceOfInferenceCreditsInPSLTerms();
    const priceDifferencePercentage =
      await this.calculatePriceDifferencePercentage(
        quotedPricePerCredit,
        estimatedPricePerCredit
      );

    const numberFormat = new Intl.NumberFormat("en-US");
    const percentageFormat = (value) => value.toFixed(2);

    if (
      quotedPricePerCredit <= maximumPerCreditPriceInPSL &&
      quotedTotalPrice <= maximumTotalCreditPackPriceInPSL &&
      priceDifferencePercentage <=
        MAXIMUM_LOCAL_CREDIT_PRICE_DIFFERENCE_TO_ACCEPT_CREDIT_PRICING
    ) {
      logger.info(
        `Preliminary price quote is within the acceptable range: ${numberFormat.format(
          quotedPricePerCredit
        )} PSL per credit, ${numberFormat.format(
          quotedTotalPrice
        )} PSL total, which is within the maximum of ${numberFormat.format(
          maximumPerCreditPriceInPSL
        )} PSL per credit and ${numberFormat.format(
          maximumTotalCreditPackPriceInPSL
        )} PSL total. The price difference from the estimated fair market price is ${percentageFormat(
          priceDifferencePercentage * 100
        )}%, which is within the allowed maximum of ${percentageFormat(
          MAXIMUM_LOCAL_CREDIT_PRICE_DIFFERENCE_TO_ACCEPT_CREDIT_PRICING * 100
        )}%. Please be patient while the new credit pack request is initialized.`
      );
      return true;
    } else {
      logger.warn(
        `Preliminary price quote exceeds the maximum acceptable price or the price difference from the estimated fair price is too high! Quoted price: ${numberFormat.format(
          quotedPricePerCredit
        )} PSL per credit, ${numberFormat.format(
          quotedTotalPrice
        )} PSL total, maximum price: ${numberFormat.format(
          maximumPerCreditPriceInPSL
        )} PSL per credit, ${numberFormat.format(
          maximumTotalCreditPackPriceInPSL
        )} PSL total. The price difference from the estimated fair market price is ${percentageFormat(
          priceDifferencePercentage * 100
        )}%, which exceeds the allowed maximum of ${percentageFormat(
          MAXIMUM_LOCAL_CREDIT_PRICE_DIFFERENCE_TO_ACCEPT_CREDIT_PRICING * 100
        )}%.`
      );
      return false;
    }
  }

  async internalEstimateOfCreditPackTicketCostInPSL(
    desiredNumberOfCredits,
    priceCushionPercentage
  ) {
    const estimatedPricePerCredit =
      await utils.estimatedMarketPriceOfInferenceCreditsInPSLTerms();
    const estimatedTotalCostOfTicket =
      Math.round(
        desiredNumberOfCredits *
          estimatedPricePerCredit *
          (1 + priceCushionPercentage) *
          100
      ) / 100;
    return estimatedTotalCostOfTicket;
  }

  async creditPackTicketPreliminaryPriceQuoteResponse(
    supernodeURL,
    creditPackRequest,
    preliminaryPriceQuote,
    maximumTotalCreditPackPriceInPSL,
    maximumPerCreditPriceInPSL
  ) {
    try {
      if (preliminaryPriceQuote.rejection_reason_string) {
        logger.error(
          `Credit pack purchase request rejected: ${preliminaryPriceQuote.rejection_reason_string}`
        );
        return preliminaryPriceQuote;
      }

      const agreeWithPriceQuote = await this.confirmPreliminaryPriceQuote(
        preliminaryPriceQuote,
        maximumTotalCreditPackPriceInPSL,
        maximumPerCreditPriceInPSL
      );

      logger.info(
        `Agree with price quote: ${agreeWithPriceQuote}; responding to preliminary price quote to Supernode at ${supernodeURL}...`
      );
      const priceQuoteResponse = {
        sha3_256_hash_of_credit_pack_purchase_request_fields:
          creditPackRequest.sha3_256_hash_of_credit_pack_purchase_request_fields,
        sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_fields:
          preliminaryPriceQuote.sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_fields,
        credit_pack_purchase_request_fields_json_b64:
          preliminaryPriceQuote.credit_pack_purchase_request_fields_json_b64,
        agree_with_preliminary_price_quote: agreeWithPriceQuote,
        credit_usage_tracking_psl_address:
          preliminaryPriceQuote.credit_usage_tracking_psl_address,
        preliminary_quoted_price_per_credit_in_psl: parseFloat(
          preliminaryPriceQuote.preliminary_quoted_price_per_credit_in_psl
        ),
        preliminary_price_quote_response_timestamp_utc_iso_string:
          getIsoStringWithMicroseconds(),
        preliminary_price_quote_response_pastel_block_height:
          await rpc.getCurrentPastelBlockHeight(),
        preliminary_price_quote_response_message_version_string: "1.0",
        requesting_end_user_pastelid:
          creditPackRequest.requesting_end_user_pastelid,
        sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_response_fields:
          "",
        requesting_end_user_pastelid_signature_on_preliminary_price_quote_response_hash:
          "",
      };

      // Compute hashes and signatures
      priceQuoteResponse.sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_response_fields =
        await utils.computeSHA3256HashOfSQLModelResponseFields(
          priceQuoteResponse
        );
      priceQuoteResponse.requesting_end_user_pastelid_signature_on_preliminary_price_quote_response_hash =
        await rpc.signMessageWithPastelID(
          creditPackRequest.requesting_end_user_pastelid,
          priceQuoteResponse.sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_response_fields,
          this.passphrase
        );

      // Validate the price quote response
      const {
        error: priceQuoteValidationError,
        value: validatedPriceQuoteResponse,
      } =
        await schemas.creditPackPurchaseRequestPreliminaryPriceQuoteResponseSchema.validate(
          priceQuoteResponse
        );
      if (priceQuoteValidationError) {
        throw new Error(
          `Invalid price quote response: ${priceQuoteValidationError.message}`
        );
      }

      // Prepare model for endpoint before sending
      let preparedPriceQuoteResponse = await utils.prepareModelForEndpoint(
        validatedPriceQuoteResponse
      );

      delete preparedPriceQuoteResponse["id"];
      preparedPriceQuoteResponse["agree_with_preliminary_price_quote"] =
        preparedPriceQuoteResponse["agree_with_preliminary_price_quote"]
          ? 1
          : 0;

      // Prepare and send the payload to the supernode
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const completePriceQuoteResponse = {
        challenge,
        challenge_id,
        challenge_signature,
        preliminary_price_quote_response: preparedPriceQuoteResponse,
      };

      const response = await fetch(
        `${supernodeURL}/credit_purchase_preliminary_price_quote_response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(completePriceQuoteResponse),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();

      if (result.termination_reason_string) {
        logger.error(
          `Credit pack purchase request response terminated: ${result.termination_reason_string}`
        );
        const terminationResponse = await utils.prepareModelForValidation(
          result
        );
        const { error: terminationError, value: validatedTermination } =
          await schemas.creditPackPurchaseRequestResponseTerminationSchema.validate(
            terminationResponse
          );
        if (terminationError) {
          throw new Error(
            `Invalid credit pack purchase request response termination: ${terminationError.message}`
          );
        }
        await db.addData(
          "CreditPackPurchaseRequestResponseTermination",
          validatedTermination
        );
        return validatedTermination;
      } else {
        let transformedResult =
          utils.transformCreditPackPurchaseRequestResponse(
            await utils.prepareModelForValidation(result)
          );
        utils.logActionWithPayload(
          "receiving",
          "response to credit pack purchase request",
          transformedResult
        );
        const { error: resultError, value: validatedResponse } =
          await schemas.creditPackPurchaseRequestResponseSchema.validate(
            transformedResult
          );
        if (resultError) {
          throw new Error(
            `Invalid credit pack purchase request response: ${resultError.message}`
          );
        }
        await db.addData(
          "CreditPackPurchaseRequestResponse",
          validatedResponse
        );
        return validatedResponse;
      }
    } catch (error) {
      logger.error(
        `Error responding to preliminary price quote: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async confirmCreditPurchaseRequest(
    supernodeURL,
    creditPackPurchaseRequestConfirmation
  ) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const payload = await utils.prepareModelForEndpoint(
        creditPackPurchaseRequestConfirmation
      );
      utils.logActionWithPayload(
        "confirming",
        "credit pack purchase request",
        payload
      );
      const response = await fetch(
        `${supernodeURL}/confirm_credit_purchase_request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: payload,
            challenge,
            challenge_id,
            challenge_signature,
          }),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      utils.logActionWithPayload(
        "receiving",
        "response to credit pack purchase confirmation",
        result
      );
      const { error: validationError, value: validatedResult } =
        await schemas.creditPackPurchaseRequestConfirmationResponseSchema.validate(
          result
        );
      if (validationError) {
        throw new Error(
          `Invalid credit pack purchase request confirmation response: ${validationError.message}`
        );
      }
      await db.addData(
        "CreditPackPurchaseRequestConfirmationResponse",
        validatedResult
      );
      return validatedResult;
    } catch (error) {
      logger.error(
        `Error confirming credit pack purchase request: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async checkStatusOfCreditPurchaseRequest(
    supernodeURL,
    creditPackPurchaseRequestHash
  ) {
    try {
      // Request challenge from the server
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      // Build and validate the status check model
      const statusCheck = {
        sha3_256_hash_of_credit_pack_purchase_request_fields:
          creditPackPurchaseRequestHash,
        requesting_end_user_pastelid: this.pastelID,
        requesting_end_user_pastelid_signature_on_sha3_256_hash_of_credit_pack_purchase_request_fields:
          await rpc.signMessageWithPastelID(
            this.pastelID,
            creditPackPurchaseRequestHash,
            this.passphrase
          ),
      };
      const { error: validationError, value: validatedStatusCheck } =
        await schemas.creditPackRequestStatusCheckSchema.validate(statusCheck);
      if (validationError) {
        logger.error(
          `Invalid credit pack request status check: ${validationError.message}`
        );
        throw new Error(
          `Invalid credit pack request status check: ${validationError.message}`
        );
      }
      delete validatedStatusCheck["id"];
      utils.logActionWithPayload(
        "checking",
        "status of credit pack purchase request",
        validatedStatusCheck
      );
      // Send the request to the server
      const response = await fetch(
        `${supernodeURL}/check_status_of_credit_purchase_request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credit_pack_request_status_check: validatedStatusCheck,
            challenge,
            challenge_id,
            challenge_signature,
          }),
        }
      );
      // Check response status and handle any errors
      if (!response.ok) {
        throw new Error(
          `HTTP error ${response.status}: ${response.statusText}`
        );
      }
      const responseData = await response.json();
      utils.logActionWithPayload(
        "receiving",
        "credit pack purchase request response from Supernode",
        responseData
      );
      // Validate the received result
      let transformedResult = await utils.prepareModelForValidation(
        responseData
      );
      delete transformedResult["id"];
      const { error: resultError, value: validatedResult } =
        await schemas.creditPackPurchaseRequestStatusSchema.validate(
          transformedResult
        );
      if (resultError) {
        throw new Error(
          `Invalid credit pack purchase request status: ${resultError.message}`
        );
      }
      // Create and return the status instance from the validated result
      await db.addData("CreditPackPurchaseRequestStatus", validatedResult);
      return validatedResult;
    } catch (error) {
      logger.error(
        `Error checking status of credit purchase request: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error; // Rethrow to handle error upstream
    }
  }

  async creditPackPurchaseCompletionAnnouncement(
    supernodeURL,
    creditPackPurchaseRequestConfirmation
  ) {
    try {
      // Validate the incoming data
      const { error, value: validatedConfirmation } =
        await schemas.creditPackPurchaseRequestConfirmationSchema.validate(
          creditPackPurchaseRequestConfirmation
        );
      if (error) {
        logger.error(
          `Invalid credit pack purchase request confirmation: ${error.message}`
        );
        return; // Return early instead of throwing an error
      }

      // Request challenge from the server
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);

      // Prepare the model for the endpoint
      let payload = validatedConfirmation;
      delete payload["id"]; // Removing the 'id' key as done in the Python method

      // Send the request to the server with a shortened timeout
      const response = await fetch(
        `${supernodeURL}/credit_pack_purchase_completion_announcement`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: payload,
            challenge,
            challenge_id,
            challenge_signature,
          }),
        }
      );

      // Check response status and log any errors
      if (!response.ok) {
        logger.error(`HTTP error ${response.status}: ${response.statusText}`);
      } else {
        logger.info(
          `Credit pack purchase completion announcement sent successfully to ${supernodeURL}`
        );
      }
    } catch (error) {
      // Log the error without rethrowing to prevent upstream disruption
      if (error.name === "AbortError") {
        logger.error(
          `Timeout error sending credit pack purchase completion announcement to ${supernodeURL}: ${error.message}`
        );
      } else {
        logger.error(
          `Error sending credit pack purchase completion announcement to ${supernodeURL}: ${
            error.message || error
          }`
        );
      }
    }
  }

  async creditPackStorageRetryRequest(
    supernodeURL,
    creditPackStorageRetryRequest
  ) {
    try {
      const { error, value: validatedRequest } =
        await schemas.creditPackStorageRetryRequestSchema.validate(
          creditPackStorageRetryRequest
        );
      if (error) {
        throw new Error(
          `Invalid credit pack storage retry request: ${error.message}`
        );
      }

      await db.addData("CreditPackStorageRetryRequest", validatedRequest);

      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);

      const payload = await utils.prepareModelForEndpoint(validatedRequest);
      utils.logActionWithPayload(
        "sending",
        "credit pack storage retry request",
        payload
      );

      const response = await fetch(
        `${supernodeURL}/credit_pack_storage_retry_request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: payload,
            challenge,
            challenge_id,
            challenge_signature,
          }),
        }
      );

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      utils.logActionWithPayload(
        "receiving",
        "response to credit pack storage retry request",
        result
      );

      let transformedResult = await utils.prepareModelForValidation(result);
      const { error: responseError, value: validatedResponse } =
        await schemas.creditPackStorageRetryRequestResponseSchema.validate(
          transformedResult
        );
      if (responseError) {
        throw new Error(
          `Invalid credit pack storage retry request response: ${responseError.message}`
        );
      }

      await db.addData(
        "CreditPackStorageRetryRequestResponse",
        validatedResponse
      );
      return validatedResponse;
    } catch (error) {
      logger.error(
        `Error sending credit pack storage retry request: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async creditPackStorageRetryCompletionAnnouncement(
    supernodeURL,
    creditPackStorageRetryRequestResponse
  ) {
    try {
      const { error, value: validatedResponse } =
        await schemas.creditPackStorageRetryRequestResponseSchema.validate(
          creditPackStorageRetryRequestResponse
        );
      if (error) {
        throw new Error(
          `Invalid credit pack storage retry request response: ${error.message}`
        );
      }

      await db.addData(
        "CreditPackStorageRetryRequestResponse",
        validatedResponse
      );

      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);

      const payload = await utils.prepareModelForEndpoint(validatedResponse);
      utils.logActionWithPayload(
        "sending",
        "storage retry completion announcement message",
        payload
      );

      const response = await fetch(
        `${supernodeURL}/credit_pack_storage_retry_completion_announcement`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: payload,
            challenge,
            challenge_id,
            challenge_signature,
          }),
        }
      );

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
    } catch (error) {
      logger.error(
        `Error sending credit pack storage retry completion announcement: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async retrieveCreditPackTicketFromPurchaseBurnTxid(supernodeURL, txid) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const payload = {
        purchase_burn_txid: txid,
        challenge,
        challenge_id,
        challenge_signature,
      };
      utils.logActionWithPayload(
        "retrieving",
        "credit pack ticket from purchase burn txid",
        payload
      );

      const response = await fetch(
        `${supernodeURL}/retrieve_credit_pack_ticket_from_purchase_burn_txid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);

      const ticketInfo = await response.json();
      logger.info(
        `Received credit pack ticket for purchase burn txid ${txid}: ${JSON.stringify(
          ticketInfo
        )}`
      );
      return ticketInfo;
    } catch (error) {
      logger.error(
        `Error retrieving credit pack ticket for purchase burn txid ${txid}: ${error.message}`
      );
      throw error;
    }
  }

  async getFinalCreditPackRegistrationTxidFromPurchaseBurnTxid(
    supernodeURL,
    purchaseBurnTxid
  ) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const payload = {
        purchase_burn_txid: purchaseBurnTxid,
        challenge,
        challenge_id,
        challenge_signature,
      };
      utils.logActionWithPayload(
        "retrieving",
        "final credit pack registration txid",
        payload
      );

      const response = await fetch(
        `${supernodeURL}/get_final_credit_pack_registration_txid_from_credit_purchase_burn_txid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok)
        throw new Error(`HTTP error! Status: ${response.status}`);

      const responseData = await response.json();
      const finalTxid = responseData.final_credit_pack_registration_txid;
      logger.info(
        `Received final credit pack registration txid for purchase burn txid ${purchaseBurnTxid}: ${finalTxid}`
      );
      return finalTxid;
    } catch (error) {
      logger.error(
        `Error retrieving final credit pack registration txid for purchase burn txid ${purchaseBurnTxid}: ${error.message}`
      );
      throw error;
    }
  }

  async makeInferenceAPIUsageRequest(supernodeURL, requestData) {
    try {
      const { error, value: validatedRequest } =
        await schemas.inferenceAPIUsageRequestSchema.validate(requestData);
      if (error) {
        throw new Error(
          `Invalid inference API usage request: ${error.message}`
        );
      }
      delete validatedRequest["id"];
      await db.addData("InferenceAPIUsageRequest", validatedRequest);
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const payload = await utils.prepareModelForEndpoint(validatedRequest);
      utils.logActionWithPayload(
        "making",
        "inference usage request",
        validatedRequest
      );
      const response = await fetch(
        `${supernodeURL}/make_inference_api_usage_request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inference_api_usage_request: validatedRequest,
            challenge,
            challenge_id,
            challenge_signature,
          }),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      utils.logActionWithPayload(
        "received",
        "response to inference usage request",
        result
      );
      let transformedResult = await utils.prepareModelForValidation(result);
      delete transformedResult["id"];
      const { error: responseError, value: validatedResponse } =
        await schemas.inferenceAPIUsageResponseSchema.validate(
          transformedResult
        );
      if (responseError) {
        throw new Error(
          `Invalid inference API usage response: ${responseError.message}`
        );
      }
      await db.addData("InferenceAPIUsageResponse", validatedResponse);
      return validatedResponse;
    } catch (error) {
      logger.error(
        `Error making inference API usage request: ${utils.safeStringify(
          error
        )}`
      );
      throw error;
    }
  }

  async sendInferenceConfirmation(supernodeURL, confirmationData) {
    try {
      const confirmationDataJSON = confirmationData;
      // Remove the 'id' field from the JSON object
      delete confirmationDataJSON["id"];

      const { error, value: validatedConfirmation } =
        await schemas.inferenceConfirmationSchema.validate(
          confirmationDataJSON
        );
      if (error) {
        throw new Error(
          `Invalid inference confirmation data: ${error.message}`
        );
      }
      await db.addData("InferenceConfirmation", validatedConfirmation);
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);

      const payload = await utils.prepareModelForEndpoint(
        validatedConfirmation
      );
      utils.logActionWithPayload("sending", "inference confirmation", payload);
      const response = await fetch(
        `${supernodeURL}/confirm_inference_request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inference_confirmation: confirmationDataJSON,
            challenge,
            challenge_id,
            challenge_signature,
          }),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      utils.logActionWithPayload(
        "receiving",
        "response to inference confirmation",
        result
      );

      return result;
    } catch (error) {
      logger.error(
        `Error sending inference confirmation: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async checkStatusOfInferenceRequestResults(
    supernodeURL,
    inferenceResponseID
  ) {
    try {
      logger.info(
        `Checking status of inference request results for ID ${inferenceResponseID}`
      );

      const response = await fetch(
        `${supernodeURL}/check_status_of_inference_request_results/${inferenceResponseID}`
      );

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      utils.logActionWithPayload(
        "receiving",
        `status of inference request results for ID ${inferenceResponseID}`,
        result
      );

      return typeof result === "boolean" ? result : false;
    } catch (error) {
      logger.error(
        `Error checking status of inference request results from Supernode URL: ${supernodeURL}: ${utils.safeStringify(
          error
        )}`
      );
      return false;
    }
  }

  async retrieveInferenceOutputResults(
    supernodeURL,
    inferenceRequestID,
    inferenceResponseID
  ) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const params = new URLSearchParams({
        inference_response_id: inferenceResponseID,
        pastelid: this.pastelID,
        challenge,
        challenge_id,
        challenge_signature,
      });
      utils.logActionWithPayload(
        "attempting",
        `to retrieve inference output results for response ID ${inferenceResponseID}`,
        params
      );
      const response = await fetch(
        `${supernodeURL}/retrieve_inference_output_results?${params}`,
        {
          method: "POST",
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      delete result["id"]; // Remove the 'id' field from the JSON object
      utils.logActionWithPayload(
        "receiving",
        "inference output results",
        result
      );
      let transformedResult = await utils.prepareModelForValidation(result);
      const { error: validationError, value: validatedResult } =
        await schemas.inferenceAPIOutputResultSchema.validate(
          transformedResult
        );
      if (validationError) {
        throw new Error(
          `Invalid inference API output result: ${validationError.message}`
        );
      }
      await db.addData("InferenceAPIOutputResult", validatedResult);
      return validatedResult;
    } catch (error) {
      logger.error(
        `Error retrieving inference output results: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async callAuditInferenceRequestResponse(supernodeURL, inferenceResponseID) {
    try {
      const signature = await rpc.signMessageWithPastelID(
        this.pastelID,
        inferenceResponseID,
        this.passphrase
      );
      const payload = {
        inference_response_id: inferenceResponseID,
        pastel_id: this.pastelID,
        signature,
      };
      const response = await fetch(
        `${supernodeURL}/audit_inference_request_response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      delete result["id"]; // Remove the 'id' field from the JSON object
      let transformedResult = await utils.prepareModelForValidation(result);
      const { error: validationError, value: validatedResult } =
        await schemas.inferenceAPIUsageResponseSchema.validate(
          transformedResult
        );
      if (validationError) {
        throw new Error(
          `Invalid inference API usage response: ${validationError.message}`
        );
      }
      return validatedResult;
    } catch (error) {
      logger.error(
        `Error calling audit inference request response from Supernode URL: ${supernodeURL}: ${utils.safeStringify(
          error
        )}`
      );
      throw error;
    }
  }

  async callAuditInferenceRequestResult(supernodeURL, inferenceResponseID) {
    try {
      const signature = await rpc.signMessageWithPastelID(
        this.pastelID,
        inferenceResponseID,
        this.passphrase
      );
      const payload = {
        inference_response_id: inferenceResponseID,
        pastel_id: this.pastelID,
        signature,
      };
      const response = await fetch(
        `${supernodeURL}/audit_inference_request_result`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      delete result["id"]; // Remove the 'id' field from the JSON object
      let transformedResult = await utils.prepareModelForValidation(result);
      const { error: validationError, value: validatedResult } =
        await schemas.inferenceAPIOutputResultSchema.validate(
          transformedResult
        );
      if (validationError) {
        throw new Error(
          `Invalid inference API output result: ${validationError.message}`
        );
      }
      return validatedResult;
    } catch (error) {
      logger.error(
        `Error calling audit inference request result from Supernode URL: ${supernodeURL}: ${utils.safeStringify(
          error
        )}`
      );
      throw error;
    }
  }

  async auditInferenceRequestResponseID(
    inferenceResponseID,
    pastelIDOfSupernodeToAudit
  ) {
    try {
      const { validMasternodeListFullDF } = await rpc.checkSupernodeList();
      const filteredSupernodes = await utils.filterSupernodes(
        validMasternodeListFullDF
      );

      const supernodeURLsAndPastelIDs = filteredSupernodes
        .filter(({ pastelID }) => pastelID !== pastelIDOfSupernodeToAudit)
        .slice(0, 5); // Get the 5 closest supernodes

      const listOfSupernodePastelIDs = supernodeURLsAndPastelIDs.map(
        ({ pastelID }) => pastelID
      );
      const listOfSupernodeURLs = supernodeURLsAndPastelIDs.map(
        ({ url }) => url
      );
      const listOfSupernodeIPs = listOfSupernodeURLs.map(
        (url) => url.split("//")[1].split(":")[0]
      );

      logger.info(
        `Now attempting to audit inference request response with ID ${inferenceResponseID} with ${listOfSupernodePastelIDs.length} closest supernodes (with Supernode IPs of ${listOfSupernodeIPs})...`
      );

      const responseAuditTasks = listOfSupernodeURLs.map((url) =>
        this.callAuditInferenceRequestResponse(url, inferenceResponseID)
      );
      const responseAuditResults = await Promise.all(responseAuditTasks);

      await new Promise((resolve) => setTimeout(resolve, 20000));

      logger.info(
        `Now attempting to audit inference request result for response ID ${inferenceResponseID} by comparing information from other Supernodes to the information reported by the Responding Supernode...`
      );

      const resultAuditTasks = listOfSupernodeURLs.map((url) =>
        this.callAuditInferenceRequestResult(url, inferenceResponseID)
      );
      const resultAuditResults = await Promise.all(resultAuditTasks);

      const auditResults = [...responseAuditResults, ...resultAuditResults];
      logger.info(
        `Audit results retrieved for inference response ID ${inferenceResponseID}`
      );

      return auditResults;
    } catch (error) {
      logger.error(
        `Error auditing inference request response ID: ${utils.safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async checkIfSupernodeSupportsDesiredModel(
    supernodeURL,
    modelCanonicalString,
    modelInferenceTypeString,
    modelParametersJSON
  ) {
    try {
      const response = await fetch(`${supernodeURL}/get_inference_model_menu`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const modelMenu = await response.json();
      const desiredParameters = JSON.parse(modelParametersJSON);

      for (const model of modelMenu.models) {
        if (
          model.model_name === modelCanonicalString &&
          model.supported_inference_type_strings.includes(
            modelInferenceTypeString
          )
        ) {
          const unsupportedParameters = [];

          for (const [desiredParam, desiredValue] of Object.entries(
            desiredParameters
          )) {
            let paramFound = false;

            for (const param of model.model_parameters) {
              if (
                param.name === desiredParam &&
                param.inference_types_parameter_applies_to.includes(
                  modelInferenceTypeString
                )
              ) {
                if ("type" in param) {
                  if (
                    param.type === "int" &&
                    Number.isInteger(Number(desiredValue))
                  ) {
                    paramFound = true;
                  } else if (
                    param.type === "float" &&
                    !isNaN(parseFloat(desiredValue))
                  ) {
                    paramFound = true;
                  } else if (
                    param.type === "string" &&
                    typeof desiredValue === "string"
                  ) {
                    if (
                      "options" in param &&
                      param.options.includes(desiredValue)
                    ) {
                      paramFound = true;
                    } else if (!("options" in param)) {
                      paramFound = true;
                    }
                  }
                } else {
                  paramFound = true;
                }
                break;
              }
            }

            if (!paramFound) {
              unsupportedParameters.push(desiredParam);
            }
          }

          if (unsupportedParameters.length === 0) {
            return true;
          } else {
            const unsupportedParamStr = unsupportedParameters.join(", ");
            logger.error(
              `Unsupported model parameters for ${modelCanonicalString}: ${unsupportedParamStr}`
            );
            return false;
          }
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async getClosestSupernodeURLsThatSupportsDesiredModel(
    desiredModelCanonicalString,
    desiredModelInferenceTypeString,
    desiredModelParametersJSON,
    N = 12
  ) {
    const timeoutPeriod = 3000; // Timeout period in milliseconds

    try {
      const { validMasternodeListFullDF } = await rpc.checkSupernodeList();
      const filteredSupernodes = await utils.filterSupernodes(
        validMasternodeListFullDF
      );

      // Prepare all the promises for checking supernodes concurrently
      const checkSupernodePromises = filteredSupernodes.map((supernode) => {
        const startTime = Date.now(); // Capture the start time for the supernode check

        return Promise.race([
          this.checkIfSupernodeSupportsDesiredModel(
            supernode.url,
            desiredModelCanonicalString,
            desiredModelInferenceTypeString,
            desiredModelParametersJSON
          ).then((result) => ({
            result,
            url: supernode.url,
            responseTime: Date.now() - startTime, // Capture the response time
          })),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutPeriod)
          ),
        ]).catch(() => null); // Silently catch and return null for failed requests
      });

      // Wait for all promises to settle
      const results = await Promise.allSettled(checkSupernodePromises);

      // Filter out null or rejected results
      const validResponses = results
        .filter((res) => res.status === "fulfilled" && res.value !== null)
        .map((res) => res.value);

      // Sort the valid responses by their response times (fastest first)
      const sortedResponses = validResponses.sort(
        (a, b) => a.responseTime - b.responseTime
      );

      // Return the closest N supernodes, capped at the number available
      return sortedResponses.slice(0, N).map((response) => response.url);
    } catch (error) {
      throw new Error(`Failed to get closest supernodes: ${error.message}`);
    }
  }
}

export default PastelInferenceClient;
