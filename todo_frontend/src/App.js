import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { api } from "./api/client";

function formatDueDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function safeErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return err.message || "Request failed";
}

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState("light");

  const [statusFilter, setStatusFilter] = useState("all"); // all|active|completed
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(""); // "" -> all, "uncat" -> null, else numeric id as string

  const [todos, setTodos] = useState([]);
  const [totalTodos, setTotalTodos] = useState(0);
  const [categories, setCategories] = useState([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [mutating, setMutating] = useState(false);

  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // create todo form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategoryId, setNewCategoryId] = useState(""); // "" -> none
  const [newDueDate, setNewDueDate] = useState(""); // datetime-local string

  // inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  // history drawer
  const [historyTodo, setHistoryTodo] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);

  // Effect to apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const categoryIdParam = useMemo(() => {
    if (!categoryFilter) return null; // not sent
    if (categoryFilter === "uncat") return null;
    const n = Number(categoryFilter);
    return Number.isFinite(n) ? n : null;
  }, [categoryFilter]);

  async function loadCategories() {
    const data = await api.listCategories();
    setCategories(data);
  }

  async function loadTodos({ showSpinner } = { showSpinner: true }) {
    setError(null);
    if (showSpinner) setListLoading(true);

    try {
      const query = {
        status: statusFilter,
        q: search || null,
      };

      // category filtering: "all" (unset) vs "uncat" -> category_id=null.
      // Backend interprets category_id=null as unset; to support "uncategorized"
      // we filter client-side after fetching.
      if (categoryFilter && categoryFilter !== "uncat") {
        query.category_id = categoryIdParam;
      }

      const res = await api.listTodos(query);

      let items = res.items || [];
      if (categoryFilter === "uncat") {
        items = items.filter((t) => t.category_id === null || t.category_id === undefined);
      }

      setTodos(items);
      setTotalTodos(res.total ?? items.length);
    } catch (e) {
      setError(safeErrorMessage(e));
    } finally {
      if (showSpinner) setListLoading(false);
    }
  }

  useEffect(() => {
    // initial load
    let cancelled = false;

    async function init() {
      setInitialLoading(true);
      setError(null);

      try {
        await Promise.all([loadCategories(), loadTodos({ showSpinner: false })]);
      } catch (e) {
        if (!cancelled) setError(safeErrorMessage(e));
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // reload list on filters
    if (initialLoading) return;
    loadTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    // debounce search
    if (initialLoading) return;

    const t = setTimeout(() => {
      loadTodos();
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function withMutation(fn) {
    setNotice(null);
    setError(null);
    setMutating(true);
    try {
      await fn();
    } catch (e) {
      setError(safeErrorMessage(e));
      throw e;
    } finally {
      setMutating(false);
    }
  }

  function resetCreateForm() {
    setNewTitle("");
    setNewDescription("");
    setNewCategoryId("");
    setNewDueDate("");
  }

  async function onCreateTodo(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }

    const payload = {
      title,
      description: newDescription.trim() ? newDescription.trim() : null,
      category_id: newCategoryId ? Number(newCategoryId) : null,
      due_date: newDueDate ? new Date(newDueDate).toISOString() : null,
      completed: false,
    };

    await withMutation(async () => {
      await api.createTodo(payload);
      resetCreateForm();
      await loadTodos();
      setNotice("Todo added.");
    });
  }

  function beginEdit(todo) {
    setEditingId(todo.id);
    setEditTitle(todo.title || "");
    setEditDescription(todo.description || "");
    setEditCategoryId(todo.category_id ? String(todo.category_id) : "");
    setEditDueDate(todo.due_date ? new Date(todo.due_date).toISOString().slice(0, 16) : "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditCategoryId("");
    setEditDueDate("");
  }

  async function saveEdit(todoId) {
    const title = editTitle.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }

    const payload = {
      title,
      description: editDescription.trim() ? editDescription.trim() : null,
      category_id: editCategoryId ? Number(editCategoryId) : null,
      due_date: editDueDate ? new Date(editDueDate).toISOString() : null,
    };

    await withMutation(async () => {
      await api.updateTodo(todoId, payload);
      cancelEdit();
      await loadTodos();
      setNotice("Todo updated.");
    });
  }

  async function toggleTodo(todoId) {
    await withMutation(async () => {
      await api.toggleTodo(todoId);
      await loadTodos({ showSpinner: false });
    });
  }

  async function deleteTodo(todoId) {
    await withMutation(async () => {
      await api.deleteTodo(todoId);
      await loadTodos();
      setNotice("Todo deleted.");
    });
  }

  async function openHistory(todo) {
    setHistoryTodo(todo);
    setHistoryItems([]);
    setHistoryError(null);
    setHistoryLoading(true);

    try {
      const items = await api.getTodoHistory(todo.id, { limit: 100, offset: 0 });
      setHistoryItems(items);
    } catch (e) {
      setHistoryError(safeErrorMessage(e));
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryTodo(null);
    setHistoryItems([]);
    setHistoryError(null);
    setHistoryLoading(false);
  }

  const categoryNameById = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  return (
    <div className="App">
      <header className="App-header todo-shell">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>

        <div className="todo-header">
          <div className="todo-brand">
            <div className="todo-badge" aria-hidden="true">
              CRT
            </div>
            <div>
              <h1 className="todo-title">Retro Todo</h1>
              <p className="todo-subtitle">Now powered by the backend API</p>
            </div>
          </div>

          <div className="todo-meta">
            <span className="pill">Total: {totalTodos}</span>
            <span className="pill">Showing: {todos.length}</span>
          </div>
        </div>

        {(error || notice) && (
          <div className={`banner ${error ? "banner-error" : "banner-ok"}`} role={error ? "alert" : "status"}>
            <div className="banner-text">{error || notice}</div>
            <button className="banner-close" onClick={() => (error ? setError(null) : setNotice(null))} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <section className="panel" aria-label="Create todo">
          <form className="todo-form" onSubmit={onCreateTodo}>
            <div className="form-row">
              <label className="label">
                Title
                <input
                  className="input"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Add a task…"
                  maxLength={500}
                  disabled={mutating}
                />
              </label>

              <label className="label">
                Category
                <select
                  className="select"
                  value={newCategoryId}
                  onChange={(e) => setNewCategoryId(e.target.value)}
                  disabled={mutating || initialLoading}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label className="label">
                Description (optional)
                <input
                  className="input"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Details…"
                  maxLength={5000}
                  disabled={mutating}
                />
              </label>

              <label className="label">
                Due (optional)
                <input
                  className="input"
                  type="datetime-local"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  disabled={mutating}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="btn primary" type="submit" disabled={mutating}>
                {mutating ? "Saving…" : "Add Todo"}
              </button>
              <button className="btn" type="button" onClick={resetCreateForm} disabled={mutating}>
                Clear
              </button>
            </div>
          </form>
        </section>

        <section className="panel" aria-label="Filters">
          <div className="filters">
            <div className="filter-group" role="group" aria-label="Status filter">
              <button className={`btn chip ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")} type="button">
                All
              </button>
              <button
                className={`btn chip ${statusFilter === "active" ? "active" : ""}`}
                onClick={() => setStatusFilter("active")}
                type="button"
              >
                Active
              </button>
              <button
                className={`btn chip ${statusFilter === "completed" ? "active" : ""}`}
                onClick={() => setStatusFilter("completed")}
                type="button"
              >
                Completed
              </button>
            </div>

            <div className="filter-group">
              <label className="label inline">
                Search
                <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find…" disabled={initialLoading} />
              </label>

              <label className="label inline">
                Category
                <select
                  className="select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  disabled={initialLoading}
                >
                  <option value="">All</option>
                  <option value="uncat">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="panel" aria-label="Todo list">
          <div className="panel-header">
            <h2 className="panel-title">Todos</h2>
            <button className="btn" type="button" onClick={() => loadTodos()} disabled={listLoading || initialLoading || mutating}>
              {listLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {initialLoading ? (
            <div className="skeleton" aria-live="polite">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ) : todos.length === 0 ? (
            <div className="empty">No todos match your filters.</div>
          ) : (
            <ul className={`todo-list ${listLoading ? "dim" : ""}`} aria-busy={listLoading ? "true" : "false"}>
              {todos.map((t) => {
                const isEditing = editingId === t.id;
                const categoryLabel = t.category_id ? categoryNameById.get(t.category_id) : "Uncategorized";

                return (
                  <li key={t.id} className={`todo-item ${t.completed ? "completed" : ""}`}>
                    <div className="todo-main">
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={!!t.completed}
                          onChange={() => toggleTodo(t.id)}
                          disabled={mutating}
                          aria-label={t.completed ? "Mark as not completed" : "Mark as completed"}
                        />
                        <span className="checkmark" aria-hidden="true" />
                      </label>

                      <div className="todo-content">
                        {isEditing ? (
                          <div className="edit-grid">
                            <label className="label">
                              Title
                              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={500} disabled={mutating} />
                            </label>

                            <label className="label">
                              Category
                              <select
                                className="select"
                                value={editCategoryId}
                                onChange={(e) => setEditCategoryId(e.target.value)}
                                disabled={mutating}
                              >
                                <option value="">None</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="label">
                              Description
                              <input
                                className="input"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                maxLength={5000}
                                disabled={mutating}
                              />
                            </label>

                            <label className="label">
                              Due
                              <input
                                className="input"
                                type="datetime-local"
                                value={editDueDate}
                                onChange={(e) => setEditDueDate(e.target.value)}
                                disabled={mutating}
                              />
                            </label>
                          </div>
                        ) : (
                          <>
                            <div className="todo-title-row">
                              <span className="todo-text">{t.title}</span>
                              <span className="tag">{categoryLabel}</span>
                            </div>
                            {t.description ? <div className="todo-desc">{t.description}</div> : null}
                            <div className="todo-foot">
                              {t.due_date ? <span className="tiny">Due: {formatDueDate(t.due_date)}</span> : <span className="tiny">No due date</span>}
                              <span className="tiny">Updated: {formatDueDate(t.updated_at)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="todo-actions">
                      {isEditing ? (
                        <>
                          <button className="btn primary" type="button" onClick={() => saveEdit(t.id)} disabled={mutating}>
                            Save
                          </button>
                          <button className="btn" type="button" onClick={cancelEdit} disabled={mutating}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn" type="button" onClick={() => beginEdit(t)} disabled={mutating}>
                            Edit
                          </button>
                          <button className="btn" type="button" onClick={() => openHistory(t)} disabled={mutating}>
                            History
                          </button>
                          <button className="btn danger" type="button" onClick={() => deleteTodo(t.id)} disabled={mutating}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {historyTodo ? (
          <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Todo history">
            <div className="drawer">
              <div className="drawer-header">
                <div>
                  <div className="drawer-title">History</div>
                  <div className="drawer-subtitle">
                    #{historyTodo.id}: {historyTodo.title}
                  </div>
                </div>
                <button className="btn" onClick={closeHistory} type="button">
                  Close
                </button>
              </div>

              {historyLoading ? (
                <div className="skeleton">
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                </div>
              ) : historyError ? (
                <div className="empty">Failed to load history: {historyError}</div>
              ) : historyItems.length === 0 ? (
                <div className="empty">No history events.</div>
              ) : (
                <ul className="history-list">
                  {historyItems.map((h) => (
                    <li key={h.id} className="history-item">
                      <div className="history-top">
                        <span className="tag">{h.action}</span>
                        <span className="tiny">{formatDueDate(h.created_at)}</span>
                      </div>
                      <div className="history-body">
                        {h.title ? <div className="history-line">Title: {h.title}</div> : null}
                        {h.description ? <div className="history-line">Desc: {h.description}</div> : null}
                        {h.due_date ? <div className="history-line">Due: {formatDueDate(h.due_date)}</div> : null}
                        {h.completed !== null && h.completed !== undefined ? (
                          <div className="history-line">Completed: {String(h.completed)}</div>
                        ) : null}
                        {h.category_id !== null && h.category_id !== undefined ? (
                          <div className="history-line">Category: {categoryNameById.get(h.category_id) || `#${h.category_id}`}</div>
                        ) : (
                          <div className="history-line">Category: Uncategorized</div>
                        )}
                        {h.reason ? <div className="history-line">Note: {h.reason}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </header>
    </div>
  );
}

export default App;
