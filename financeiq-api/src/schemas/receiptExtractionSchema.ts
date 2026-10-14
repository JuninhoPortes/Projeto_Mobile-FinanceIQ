import { receiptCertainties, receiptClassifications, receiptReadabilities } from '../types/receiptExtraction';

const certainty = { type: 'string', enum: [...receiptCertainties] };
const nullableText = { type: ['string', 'null'] };
const field = (value: object = nullableText) => ({
  type: 'object',
  additionalProperties: false,
  required: ['value', 'certainty'],
  properties: { value, certainty }
});

// Esquema declarativo para a futura saída estruturada. As regras semânticas são
// verificadas separadamente pelo validador; JSON válido não garante leitura correta.
export const receiptExtractionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'document', 'fields'],
  properties: {
    schemaVersion: { type: 'string', enum: ['1'] },
    document: {
      type: 'object', additionalProperties: false,
      required: ['classification', 'certainty', 'readability', 'multipleDocuments'],
      properties: {
        classification: { type: 'string', enum: [...receiptClassifications] },
        certainty,
        readability: { type: 'string', enum: [...receiptReadabilities] },
        multipleDocuments: { type: 'boolean' }
      }
    },
    fields: {
      type: 'object', additionalProperties: false,
      required: ['merchant', 'description', 'amount', 'type', 'category', 'identifiedDate'],
      properties: {
        merchant: field(),
        description: field(),
        amount: {
          type: 'object', additionalProperties: false,
          required: ['valueCents', 'currency', 'certainty'],
          properties: {
            valueCents: { type: ['integer', 'null'] },
            currency: nullableText,
            certainty
          }
        },
        type: field({ type: ['string', 'null'], enum: ['income', 'outcome', null] }),
        category: field(),
        identifiedDate: field()
      }
    }
  }
} as const;
