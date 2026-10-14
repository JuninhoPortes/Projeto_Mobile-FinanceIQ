import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parse } from 'dotenv';

export async function externalReceiptDirectory(directory: string): Promise<string> {
  const folder = await realpath(directory);
  const repository = await realpath(resolve(__dirname, '../../..'));
  const fromRepository = relative(repository, folder);
  if (!fromRepository || (!isAbsolute(fromRepository) && fromRepository !== '..' && !fromRepository.startsWith(`..${sep}`))) {
    throw new Error('LOCAL_CONFIG_OUTSIDE_REPOSITORY_REQUIRED');
  }
  return folder;
}

// Executado apenas pela entrada operacional: nunca importar no aplicativo.
export async function loadReceiptLocalConfig(file: string, ambient = process.env) {
  if (ambient.NODE_ENV === 'production' || ambient.FIREBASE_AUTH_EMULATOR_HOST !== undefined) throw new Error('LOCAL_ENVIRONMENT_BLOCKED');
  const canonicalFile = await realpath(file);
  const directory = await externalReceiptDirectory(dirname(canonicalFile));
  const values = parse(await readFile(canonicalFile));
  const allowed = new Set(['RECEIPT_LOCAL_REAL_ENABLED', 'RECEIPT_OPENAI_REAL_CALLS_ENABLED', 'OPENAI_API_KEY',
    'FIREBASE_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS', 'RECEIPT_LOCAL_UID', 'PORT',
    'RECEIPT_REQUESTS_PER_MINUTE', 'RECEIPT_REQUESTS_PER_DAY', 'RECEIPT_OPENAI_MODEL',
    'RECEIPT_OPENAI_TIMEOUT_MS', 'RECEIPT_OPENAI_MAX_OUTPUT_TOKENS', 'RECEIPT_PROCESSING_TIMEOUT_MS']);
  if (Object.keys(values).some(key => !allowed.has(key))) throw new Error('LOCAL_UNKNOWN_CONFIGURATION');
  if (values.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!isAbsolute(values.GOOGLE_APPLICATION_CREDENTIALS)) throw new Error('LOCAL_ADC_PATH_REQUIRED');
    const adc = await realpath(values.GOOGLE_APPLICATION_CREDENTIALS);
    await externalReceiptDirectory(dirname(adc));
    values.GOOGLE_APPLICATION_CREDENTIALS = adc;
  }
  return { directory, values };
}
