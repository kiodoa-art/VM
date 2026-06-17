// Cloudflare Worker proxy til KickoffAPI.
// Opret en secret/environment variable i Cloudflare med navnet KICKOFF_API_KEY.
// Sæt workerens URL ind i appens Indstillinger under "Proxy URL".
// Eksempel: https://vm-api-proxy.ditnavn.workers.dev

const API_BASE = 'https://api.kickoffapi.com/api/v1';

export default {
  async fetch(request, env) {
    const incomingUrl = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const target = new URL(API_BASE + incomingUrl.pathname);
    incomingUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));

    const response = await fetch(target.toString(), {
      headers: {
        'Accept': 'application/json',
        'x-api-key': env.KICKOFF_API_KEY
      }
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
