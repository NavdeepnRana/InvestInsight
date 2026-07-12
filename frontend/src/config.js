// Central API Configuration
// Vite's server.proxy only runs during local development (`npm run dev`) and is ignored in production builds (`npm run build`).
// By defining the API base URL here, the built production application can reliably communicate directly with your backend API server (`http://3.26.5.47:3001`).
// You can also override this anytime via the VITE_API_URL environment variable in your .env or hosting deployment settings.

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://3.26.5.47:3001";

export const API_ENDPOINTS = {
  researchStream: `${API_BASE_URL}/api/research/stream`,
  research: `${API_BASE_URL}/api/research`,
  health: `${API_BASE_URL}/api/health`,
};
