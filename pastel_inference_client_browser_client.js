class PastelInferenceClient {
  constructor(pastelID, passphrase) {
    this.pastelID = pastelID;
    this.passphrase = passphrase;
  }

  async requestAndSignChallenge(supernodeURL) {
    try {
      const response = await axios.get(
        `${supernodeURL}/request_challenge/${this.pastelID}`
      );
      const { challenge, challenge_id } = response.data;
      const challenge_signature = await signMessageWithPastelID(
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
        `Error requesting and signing challenge: ${safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }

  async getCreditPackTicketFromTxid(supernodeURL, txid) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const params = {
        txid,
        pastelid: this.pastelID,
        challenge,
        challenge_id,
        challenge_signature,
      };
      logActionWithPayload(
        "retrieving",
        "credit pack ticket from txid",
        params
      );

      const response = await axios.get(
        `${supernodeURL}/get_credit_pack_ticket_from_txid`,
        {
          params,
          timeout: MESSAGING_TIMEOUT_IN_SECONDS * 1000,
        }
      );

      if (response.status !== 200) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const {
        credit_pack_purchase_request_response,
        credit_pack_purchase_request_confirmation,
      } = response.data;

      logActionWithPayload("received", "credit pack ticket from Supernode", {
        credit_pack_purchase_request_response,
        credit_pack_purchase_request_confirmation,
      });

      const { errorRequestResponse, value: validatedRequestResponse } =
        creditPackPurchaseRequestResponseSchema.validate(
          credit_pack_purchase_request_response
        );
      if (errorRequestResponse) {
        throw new Error(
          `Invalid credit pack request response: ${errorRequestResponse.message}`
        );
      }
      const { errorRequestConfirmation, value: validatedRequestConfirmation } =
        creditPackPurchaseRequestConfirmationSchema.validate(
          credit_pack_purchase_request_confirmation
        );
      if (errorRequestConfirmation) {
        throw new Error(
          `Invalid credit pack request confirmation: ${errorRequestConfirmation.message}`
        );
      }
      return {
        creditPackPurchaseRequestResponse:
          new CreditPackPurchaseRequestResponse(validatedRequestResponse),
        creditPackPurchaseRequestConfirmation:
          new CreditPackPurchaseRequestConfirmation(
            validatedRequestConfirmation
          ),
      };
    } catch (error) {
      logger.error(
        `Error retrieving credit pack ticket from txid: ${error.message}`
      );
      throw error;
    }
  }

  async internalEstimateOfCreditPackTicketCostInPSL(
    desiredNumberOfCredits,
    priceCushionPercentage
  ) {
    const estimatedPricePerCredit =
      await estimatedMarketPriceOfInferenceCreditsInPSLTerms();
    const estimatedTotalCostOfTicket =
      Math.round(
        desiredNumberOfCredits *
          estimatedPricePerCredit *
          (1 + priceCushionPercentage) *
          100
      ) / 100;
    return estimatedTotalCostOfTicket;
  }

  async getModelMenu(supernodeURL) {
    try {
      const response = await axios.get(
        `${supernodeURL}/get_inference_model_menu`,
        {
          timeout: MESSAGING_TIMEOUT_IN_SECONDS * 1000,
        }
      );
      return response.data;
    } catch (error) {
      logger.error(
        `Error fetching model menu from Supernode URL: ${supernodeURL}: ${safeStringify(
          error
        )}`
      );
      throw error;
    }
  }

  async getUserMessages(supernodeURL) {
    try {
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      const params = {
        pastelid: this.pastelID,
        challenge,
        challenge_id,
        challenge_signature,
      };
      const response = await axios.get(`${supernodeURL}/get_user_messages`, {
        params,
        timeout: MESSAGING_TIMEOUT_IN_SECONDS * 1000,
      });
      const result = response.data;
      const validatedResults = await Promise.all(
        result.map((messageData) => userMessageSchema.validate(messageData))
      );
      const userMessageInstances = await UserMessage.bulkCreate(
        validatedResults
      );
      return userMessageInstances;
    } catch (error) {
      logger.error(`Error retrieving user messages: ${error.message}`);
      throw error;
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
      logActionWithPayload("checking", "credit pack balance", payload);

      const response = await axios.post(
        `${supernodeURL}/check_credit_pack_balance`,
        payload,
        {
          timeout: MESSAGING_TIMEOUT_IN_SECONDS * 1000,
        }
      );

      if (response.status !== 200) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const balanceInfo = response.data;
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

  async creditPackTicketInitialPurchaseRequest(
    supernodeURL,
    creditPackRequest
  ) {
    try {
      // Validate the credit pack request using Joi
      const { error, value: validatedCreditPackRequest } =
        creditPackPurchaseRequestSchema.validate(creditPackRequest.toJSON());
      if (error) {
        throw new Error(`Invalid credit pack request: ${error.message}`);
      }
      // Create the credit pack purchase request in the database
      await CreditPackPurchaseRequest.put(validatedCreditPackRequest);
      logActionWithPayload(
        "requesting",
        "a new Pastel credit pack ticket",
        validatedCreditPackRequest
      );
      const { challenge, challenge_id, challenge_signature } =
        await this.requestAndSignChallenge(supernodeURL);
      let preparedCreditPackRequest = await prepareModelForEndpoint(
        creditPackRequest
      );
      const response = await axios.post(
        `${supernodeURL}/credit_purchase_initial_request`,
        {
          challenge,
          challenge_id,
          challenge_signature,
          credit_pack_request: preparedCreditPackRequest,
        },
        {
          timeout: MESSAGING_TIMEOUT_IN_SECONDS * 1000,
        }
      );
      const result = response.data;

      if (result.rejection_reason_string) {
        logger.error(
          `Credit pack purchase request rejected: ${result.rejection_reason_string}`
        );
        let rejectionResponse = await prepareModelForValidation(result);
        const { rejectionError, value: validatedRejection } =
          await creditPackPurchaseRequestRejectionSchema.validateAsync(
            rejectionResponse
          );
        if (rejectionError) {
          throw new Error(
            `Invalid credit pack purchase request rejection: ${rejectionError.message}`
          );
        }
        const creditPackPurchaseRequestRejectionInstance =
          await CreditPackPurchaseRequestRejection.create(validatedRejection);
        return creditPackPurchaseRequestRejectionInstance;
      } else {
        logActionWithPayload(
          "receiving",
          "response to credit pack purchase request",
          result
        );
        let preparedResult = await prepareModelForValidation(result);
        const { priceQuoteError, value: validatedPriceQuote } =
          await creditPackPurchaseRequestPreliminaryPriceQuoteSchema.validate(
            preparedResult
          );
        if (priceQuoteError) {
          throw new Error(
            "Invalid credit pack request: " + priceQuoteError.message
          );
        }
        const creditPackPurchaseRequestPreliminaryPriceQuoteInstance =
          await CreditPackPurchaseRequestPreliminaryPriceQuote.create(
            validatedPriceQuote
          );
        return creditPackPurchaseRequestPreliminaryPriceQuoteInstance;
      }
    } catch (error) {
      logger.error(
        `Error initiating credit pack ticket purchase: ${safeStringify(
          error.message
        )}`
      );
      throw error;
    }
  }
}

module.exports = {
  PastelInferenceClient,
};
