const Joi = require("joi");

const supernodeListSchema = yup.object({
  txid_vout: yup.string().required(),
  supernode_status: yup.string().required(),
  protocol_version: yup.number().required(),
  supernode_psl_address: yup.string().required(),
  lastseentime: yup.number().required(),
  activeseconds: yup.number().required(),
  activedays: yup.number().required(),
  lastpaidtime: yup.number().required(),
  lastpaidblock: yup.number().required(),
  ipaddress_port: yup.string().required(),
  rank: yup.number().required(),
  pubkey: yup.string().required(),
  extAddress: yup.string().required(),
  extP2P: yup.string().required(),
  extKey: yup.string().required(),
});

const messageSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  sending_sn_pastelid: yup.string().required(),
  receiving_sn_pastelid: yup.string().required(),
  sending_sn_txid_vout: yup.string().required(),
  receiving_sn_txid_vout: yup.string().required(),
  message_type: yup.string().required(),
  message_body: yup.string().required(),
  signature: yup.string().required(),
  timestamp: yup.date().required().iso(), // Validate as ISO date
});

const userMessageSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  from_pastelid: yup.string().required(),
  to_pastelid: yup.string().required(),
  message_body: yup.string().required(),
  message_signature: yup.string().required(),
  timestamp: yup.date().required().iso(), // Validate as ISO date
});

const creditPackPurchaseRequestSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  requesting_end_user_pastelid: yup.string().required(),
  requested_initial_credits_in_credit_pack: yup.number().integer().required(),
  list_of_authorized_pastelids_allowed_to_use_credit_pack: yup.string().required(),
  credit_usage_tracking_psl_address: yup.string().required(),
  request_timestamp_utc_iso_string: yup.string().required(),
  request_pastel_block_height: yup.number().integer().required(),
  credit_purchase_request_message_version_string: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  requesting_end_user_pastelid_signature_on_request_hash: yup.string().required(),
});

const creditPackPurchaseRequestRejectionSchema = yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: yup.string().required(),
  rejection_reason_string: yup.string().required(),
  rejection_timestamp_utc_iso_string: yup.string().required(),
  rejection_pastel_block_height: yup.number().integer().required(),
  credit_purchase_request_rejection_message_version_string: yup.string().required(),
  responding_supernode_pastelid: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_rejection_fields: yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_rejection_hash: yup.string().required(),
});

const creditPackPurchaseRequestPreliminaryPriceQuoteSchema = yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  credit_usage_tracking_psl_address: yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: yup.string().required(),
  preliminary_quoted_price_per_credit_in_psl: yup.number().required(),
  preliminary_total_cost_of_credit_pack_in_psl: yup.number().required(),
  preliminary_price_quote_timestamp_utc_iso_string: yup.string().required(),
  preliminary_price_quote_pastel_block_height: yup.number().integer().required(),
  preliminary_price_quote_message_version_string: yup.string().required(),
  responding_supernode_pastelid: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_fields: yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_preliminary_price_quote_hash: yup.string().required(),
});

const creditPackPurchaseRequestPreliminaryPriceQuoteResponseSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_fields: yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: yup.string().required(),
  agree_with_preliminary_price_quote: yup.boolean().required(),
  credit_usage_tracking_psl_address: yup.string().required(),
  preliminary_quoted_price_per_credit_in_psl: yup.number().required(),
  preliminary_price_quote_response_timestamp_utc_iso_string: yup.string().required(),
  preliminary_price_quote_response_pastel_block_height: yup.number().integer().required(),
  preliminary_price_quote_response_message_version_string: yup.string().required(),
  requesting_end_user_pastelid: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_preliminary_price_quote_response_fields: yup.string().required(),
  requesting_end_user_pastelid_signature_on_preliminary_price_quote_response_hash: yup.string().required(),
});

const creditPackPurchaseRequestResponseTerminationSchema = yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: yup.string().required(),
  termination_reason_string: yup.string().required(),
  termination_timestamp_utc_iso_string: yup.string().required(),
  termination_pastel_block_height: yup.number().integer().required(),
  credit_purchase_request_termination_message_version_string: yup.string().required(),
  responding_supernode_pastelid: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_termination_fields: yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_termination_hash: yup.string().required(),
});

const creditPackPurchaseRequestResponseSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: yup.string().required(),
  psl_cost_per_credit: yup.number().required(),
  proposed_total_cost_of_credit_pack_in_psl: yup.number().required(),
  credit_usage_tracking_psl_address: yup.string().required(),
  request_response_timestamp_utc_iso_string: yup.string().required(),
  request_response_pastel_block_height: yup.number().integer().required(),
  best_block_merkle_root: yup.string().required(),
  best_block_height: yup.number().integer().required(),
  credit_purchase_request_response_message_version_string: yup.string().required(),
  responding_supernode_pastelid: yup.string().required(),
  list_of_blacklisted_supernode_pastelids: yup.string().required(),
  list_of_potentially_agreeing_supernodes: yup.string().required(),
  list_of_supernode_pastelids_agreeing_to_credit_pack_purchase_terms: yup.string().required(),
  list_of_supernode_pastelids_agreeing_to_credit_pack_purchase_terms_selected_for_signature_inclusion:
  yup.string().required(),
  selected_agreeing_supernodes_signatures_dict: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_response_hash: yup.string().required(),
});

const creditPackPurchaseRequestConfirmationSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: yup.string().required(),
  requesting_end_user_pastelid: yup.string().required(),
  txid_of_credit_purchase_burn_transaction: yup.string().required(),
  credit_purchase_request_confirmation_utc_iso_string: yup.string().required(),
  credit_purchase_request_confirmation_pastel_block_height: yup.number().integer().required(),
  credit_purchase_request_confirmation_message_version_string: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: yup.string().required(),
  requesting_end_user_pastelid_signature_on_sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: yup.string().required(),
});

const creditPackPurchaseRequestConfirmationResponseSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: yup.string().required(),
  credit_pack_confirmation_outcome_string: yup.string().required(),
  pastel_api_credit_pack_ticket_registration_txid: yup.string().required(),
  credit_pack_confirmation_failure_reason_if_applicable: yup.string().allow('').optional(), // Allow empty string and make optional
  credit_purchase_request_confirmation_response_utc_iso_string: yup.string().required(),
  credit_purchase_request_confirmation_response_pastel_block_height: yup.number().integer().required(),
  credit_purchase_request_confirmation_response_message_version_string: yup.string().required(),
  responding_supernode_pastelid: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_response_fields: yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_confirmation_response_hash: yup.string().required(),
});

const creditPackRequestStatusCheckSchema = yup.object({
  id: yup.string()
    .required()
    .uuid('id must be a valid UUID v4'), // Validate as UUID v4
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  requesting_end_user_pastelid: yup.string().required(),
  requesting_end_user_pastelid_signature_on_sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
});

const creditPackPurchaseRequestStatusSchema = yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: yup.string().required(),
  status: yup.string().required(),
  status_details: yup.string().required(),
  status_update_timestamp_utc_iso_string: yup.string().required(),
  status_update_pastel_block_height: yup.number().integer().required(),
  credit_purchase_request_status_message_version_string: yup.string().required(),
  responding_supernode_pastelid: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_status_fields: yup.string().required(),
  responding_supernode_signature_on_credit_pack_purchase_request_status_hash: yup.string().required(),
});

const creditPackStorageRetryRequestSchema = yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_response_fields: yup.string().required(),
  credit_pack_purchase_request_fields_json_b64: yup.string().required(),
  requesting_end_user_pastelid: yup.string().required(),
  closest_agreeing_supernode_to_retry_storage_pastelid: yup.string().required(),
  credit_pack_storage_retry_request_timestamp_utc_iso_string: yup.string().required(),
  credit_pack_storage_retry_request_pastel_block_height: yup.number().integer().required(),
  credit_pack_storage_retry_request_message_version_string: yup.string().required(),
  sha3_256_hash_of_credit_pack_storage_retry_request_fields: yup.string().required(),
  requesting_end_user_pastelid_signature_on_credit_pack_storage_retry_request_hash: yup.string().required(),
});

const creditPackStorageRetryRequestResponseSchema = yup.object({
  sha3_256_hash_of_credit_pack_purchase_request_fields: yup.string().required(),
  sha3_256_hash_of_credit_pack_purchase_request_confirmation_fields: yup.string().required(),
  credit_pack_storage_retry_confirmation_outcome_string: yup.string().required(),
  pastel_api_credit_pack_ticket_registration_txid: yup.string().required(),
  credit_pack_storage_retry_confirmation_failure_reason_if_applicable: yup.string().required(), // Make non-optional here
  credit_pack_storage_retry_confirmation_response_utc_iso_string: yup.string().required(),
  credit_pack_storage_retry_confirmation_response_pastel_block_height: yup.number().integer().required(),
  credit_pack_storage_retry_confirmation_response_message_version_string: yup.string().required(),
  closest_agreeing_supernode_to_retry_storage_pastelid: yup.string().required(),
  sha3_256_hash_of_credit_pack_storage_retry_confirmation_response_fields: yup.string().required(),
  closest_agreeing_supernode_to_retry_storage_pastelid_signature_on_credit_pack_storage_retry_confirmation_response_hash: yup.string().required(),
});

const inferenceAPIUsageRequestSchema = yup.object({
  inference_request_id: yup.string()
    .required()
    .uuid('inference_request_id must be a valid UUID v4'), // Validate as UUID v4
  requesting_pastelid: yup.string().required(),
  credit_pack_ticket_pastel_txid: yup.string().required(),
  requested_model_canonical_string: yup.string().required(),
  model_inference_type_string: yup.string().required(),
  model_parameters_json_b64: yup.string().required(),
  model_input_data_json_b64: yup.string().required(),
  inference_request_utc_iso_string: yup.string().required(),
  inference_request_pastel_block_height: yup.number().integer().required(),
  status: yup.string().required(),
  inference_request_message_version_string: yup.string().required(),
  sha3_256_hash_of_inference_request_fields: yup.string().required(),
  requesting_pastelid_signature_on_request_hash: yup.string().required(),
});

const inferenceAPIUsageResponseSchema = yup.object({
  inference_response_id: yup.string().required(),
  inference_request_id: yup.string().required(),
  proposed_cost_of_request_in_inference_credits: yup.number().required(),
  remaining_credits_in_pack_after_request_processed: yup.number().required(),
  credit_usage_tracking_psl_address: yup.string().required(),
  request_confirmation_message_amount_in_patoshis: yup.number().integer().required(),
  max_block_height_to_include_confirmation_transaction: yup.number().integer().required(),
  inference_request_response_utc_iso_string: yup.string().required(),
  inference_request_response_pastel_block_height: yup.number().integer().required(),
  inference_request_response_message_version_string: yup.string().required(),
  sha3_256_hash_of_inference_request_response_fields: yup.string().required(),
  supernode_pastelid_and_signature_on_inference_request_response_hash: yup.string().required(),
});

const inferenceAPIOutputResultSchema = yup.object({
  inference_result_id: yup.string().required(),
  inference_request_id: yup.string().required(),
  inference_response_id: yup.string().required(),
  responding_supernode_pastelid: yup.string().required(),
  inference_result_json_base64: yup.string().required(),
  inference_result_file_type_strings: yup.string().required(),
  inference_result_utc_iso_string: yup.string().required(),
  inference_result_pastel_block_height: yup.number().integer().required(),
  inference_result_message_version_string: yup.string().required(),
  sha3_256_hash_of_inference_result_fields: yup.string().required(),
  responding_supernode_signature_on_inference_result_id: yup.string().required(),
});

const inferenceConfirmationSchema = yup.object({
  inference_request_id: yup.string().required(),
  requesting_pastelid: yup.string().required(),
  confirmation_transaction: yup.object().required(),
});

module.exports = {
  supernodeListSchema,
  messageSchema,
  userMessageSchema,
  creditPackPurchaseRequestSchema,
  creditPackPurchaseRequestRejectionSchema,
  creditPackPurchaseRequestPreliminaryPriceQuoteSchema,
  creditPackPurchaseRequestPreliminaryPriceQuoteResponseSchema,
  creditPackPurchaseRequestResponseTerminationSchema,
  creditPackPurchaseRequestResponseSchema,
  creditPackPurchaseRequestConfirmationSchema,
  creditPackPurchaseRequestConfirmationResponseSchema,
  creditPackRequestStatusCheckSchema,
  creditPackPurchaseRequestStatusSchema,
  creditPackStorageRetryRequestSchema,
  creditPackStorageRetryRequestResponseSchema,
  inferenceAPIUsageRequestSchema,
  inferenceAPIUsageResponseSchema,
  inferenceAPIOutputResultSchema,
  inferenceConfirmationSchema,
};
