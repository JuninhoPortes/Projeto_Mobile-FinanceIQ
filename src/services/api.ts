import axios from 'axios';

const API_BASE_URL = 'http://192.168.18.13:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});