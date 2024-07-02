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
}

module.exports = {
  PastelInferenceClient,
};
