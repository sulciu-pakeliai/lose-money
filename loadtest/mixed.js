import exec from "k6/execution";
import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const thinkTime = Number(__ENV.THINK_TIME || 5);
const startJitter = Number(__ENV.START_JITTER || 30);

export const options = {
  vus: 1000,
  duration: "5m",
};

export function setup() {
  const response = http.get(`${baseUrl}/api/health`);
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`Backend health check failed: ${response.status}`);
  }
}

export default function () {
  const iteration = exec.vu.iterationInInstance;
  if (iteration === 0 && startJitter > 0) {
    sleep(Math.random() * startJitter);
  }

  request("GET", "/api/state");

  if (iteration > 0 && iteration % 20 === 0) {
    request("POST", "/api/top-up", { amount: 250 });
  }

  if (iteration > 0 && iteration % 11 === 0) {
    request("GET", "/api/profile");
  }

  const action = Math.floor(Math.random() * 5);
  if (action === 0) {
    request("POST", "/api/coinflip", {
      choice: pick(["Heads", "Tails"]),
      amount: 1,
    });
  } else if (action === 1) {
    request("POST", "/api/dice", {
      betType: pick(["low", "high", "lucky7"]),
      amount: 1,
    });
  } else if (action === 2) {
    request("POST", "/api/roulette", {
      betType: "color",
      choice: pick(["red", "black"]),
      amount: 1,
    });
  } else if (action === 3) {
    request("POST", "/api/slots/spin", { amount: 1 });
  } else {
    request("POST", "/api/plinko/drop", {
      risk: pick(["low", "medium", "high"]),
      amount: 1,
    });
  }

  sleep(thinkTime);
}

function request(method, path, body) {
  const params = {
    headers: {
      Accept: "application/json",
    },
    tags: {
      endpoint: `${method} ${path}`,
    },
  };

  let response;
  if (method === "GET") {
    response = http.get(`${baseUrl}${path}`, params);
  } else {
    params.headers["Content-Type"] = "application/json";
    response = http.post(`${baseUrl}${path}`, JSON.stringify(body), params);
  }

  check(response, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
  });
}

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}
