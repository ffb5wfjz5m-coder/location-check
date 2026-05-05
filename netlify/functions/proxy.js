export async function handler(event) {
  try {
    const path = event.path || "";
    const query = event.queryStringParameters || {};

    if (!path.includes("/api/police")) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Unknown proxy route" })
      };
    }

    const lat = query.lat;
    const lon = query.lon;

    if (!lat || !lon) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing lat or lon" })
      };
    }

    const policeUrl = `https://data.police.uk/api/crimes-street/all-crime?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}`;

    const response = await fetch(policeUrl);

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Police API returned ${response.status}` })
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}