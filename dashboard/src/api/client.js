import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
});

// For Phase 1/2 development, we inject a mock user ID for testing.
client.interceptors.request.use((config) => {
  config.headers['X-User-ID'] = import.meta.env.VITE_MOCK_USER_ID || '00000000-0000-0000-0000-000000000000';
  return config;
});

export default client;
