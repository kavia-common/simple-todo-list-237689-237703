/**
 * Minimal fetch-based API client for the Todo backend.
 * Uses REACT_APP_API_BASE as the base URL (e.g. "http://localhost:3010").
 */

const API_BASE = (process.env.REACT_APP_API_BASE || "").replace(/\/+$/, "");

/**
 * Build a full API URL from a path and optional query parameters.
 * @param {string} path
 * @param {Record<string, string|number|boolean|null|undefined>} [query]
 */
function buildUrl(path, query) {
  const base = API_BASE || "";
  const url = new URL(`${base}${path}`, window.location.origin);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

/**
 * Parse backend error payloads consistently.
 * @param {Response} res
 */
async function parseError(res) {
  let payload = null;
  try {
    payload = await res.json();
  } catch (e) {
    // ignore
  }
  const detail =
    payload?.detail
      ? typeof payload.detail === "string"
        ? payload.detail
        : JSON.stringify(payload.detail)
      : null;

  return new Error(detail || `Request failed (${res.status})`);
}

/**
 * Low-level request wrapper.
 * @param {string} path
 * @param {{ method?: string, query?: any, body?: any }} [options]
 */
async function request(path, options = {}) {
  const method = options.method || "GET";
  const url = buildUrl(path, options.query);

  const res = await fetch(url, {
    method,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw await parseError(res);
  }

  if (res.status === 204) return null;
  return res.json();
}

// PUBLIC_INTERFACE
export const api = {
  /** Health check (GET /health). */
  health() {
    return request("/health");
  },

  /** Categories */
  listCategories() {
    return request("/categories");
  },
  createCategory(name) {
    return request("/categories", { method: "POST", body: { name } });
  },
  updateCategory(categoryId, name) {
    return request(`/categories/${categoryId}`, { method: "PUT", body: { name } });
  },
  deleteCategory(categoryId) {
    return request(`/categories/${categoryId}`, { method: "DELETE" });
  },

  /** Todos */
  listTodos(params) {
    // params: { status, q, category_id, limit, offset, sort, order, due_before, due_after }
    return request("/todos", { query: params });
  },
  createTodo(payload) {
    // payload: { title, description?, due_date?, category_id?, completed? }
    return request("/todos", { method: "POST", body: payload });
  },
  updateTodo(todoId, payload) {
    return request(`/todos/${todoId}`, { method: "PUT", body: payload });
  },
  deleteTodo(todoId) {
    return request(`/todos/${todoId}`, { method: "DELETE" });
  },
  toggleTodo(todoId) {
    return request(`/todos/${todoId}/toggle`, { method: "POST" });
  },

  /** History */
  getTodoHistory(todoId, params) {
    return request(`/todos/${todoId}/history`, { query: params });
  },
};
