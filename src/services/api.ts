import axios from 'axios';

const API_BASE_URL = 'http://IP_DO_COMPUTADOR:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});
