const extraction = require('../fixtures/receiptExtraction.json');
const { createSimulatedReceiptTransport } = require('../../financeiq-api/src/services/receiptSimulatedTransport.ts');

function response(value = structuredClone(extraction), overrides = {}) {
  return {
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 500 },
    ...overrides
  };
}

function simulatedTransport(reply = response()) {
  const calls = [];
  const references = [];
  const transport = createSimulatedReceiptTransport((request, options) => {
      calls.push({ request: structuredClone(request), signal: options.signal });
      references.push(request);
      return typeof reply === 'function' ? reply(request, options) : structuredClone(reply);
  });
  return Object.assign(transport, { calls, references });
}

module.exports = { response, simulatedTransport, extraction: () => structuredClone(extraction) };
