import { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, X, Check, Square, CheckSquare, Image as ImageIcon, Lightbulb,
  CalendarDays, Paperclip, ChevronLeft, ChevronRight, Trash2, Pencil,
  ArrowLeft, LayoutGrid, Home, Link as LinkIcon, FolderKanban
} from "lucide-react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase.js";


/* ============================================================
   CONSTANTES
   ============================================================ */

const STORAGE_KEY = "orgapp:data:v1";

const ACCOUNT_COLORS = [
  { key: "moss", hex: "#3F6C51" },
  { key: "ochre", hex: "#8A6D3B" },
  { key: "plum", hex: "#6B4E71" },
  { key: "teal", hex: "#2E6E7E" },
  { key: "clay", hex: "#B3452C" },
  { key: "indigo", hex: "#4B5B8A" },
];

const IDEA_COLORS = [
  { key: "sage", hex: "#DCE4CE" },
  { key: "sand", hex: "#EDE1C6" },
  { key: "blush", hex: "#EAD3CE" },
  { key: "sky", hex: "#D2E1E3" },
  { key: "lilac", hex: "#E1D6E6" },
];

const PROJECT_STAGES = [
  { key: "ideias", label: "Ideias futuras" },
  { key: "producao", label: "Em produção" },
  { key: "publicado", label: "Publicado / Finalizado" },
];

const CONTENT_STATUS = [
  { key: "rascunho", label: "Rascunho" },
  { key: "producao", label: "Em produção" },
  { key: "agendado", label: "Agendado" },
  { key: "publicado", label: "Publicado" },
];

const EVENT_TYPES = [
  { key: "deadline", label: "Prazo" },
  { key: "publicacao", label: "Publicação" },
  { key: "ideal", label: "Data ideal" },
  { key: "evento", label: "Evento" },
  { key: "oportunidade", label: "Oportunidade" },
];

const ITEM_TYPE_META = {
  tarefa: { label: "Tarefa", icon: CheckSquare },
  conteudo: { label: "Conteúdo", icon: ImageIcon },
  ideia: { label: "Ideia", icon: Lightbulb },
  evento: { label: "Data / Evento", icon: CalendarDays },
  material: { label: "Material", icon: Paperclip },
};

const TABS = [
  { key: "projetos", label: "Projetos" },
  { key: "conteudos", label: "Conteúdos" },
  { key: "tarefas", label: "Tarefas" },
  { key: "ideias", label: "Ideias" },
  { key: "calendario", label: "Calendário" },
  { key: "materiais", label: "Materiais" },
];

const PROJECT_TABS = TABS.filter((t) => t.key !== "projetos");

/* ============================================================
   UTILITÁRIOS DE DATA
   ============================================================ */

const pad = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISODate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatRelative(dateStr, today) {
  const diff = daysBetween(today, parseISODate(dateStr));
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff < 0) return `Atrasado ${-diff}d`;
  if (diff <= 7) return `Em ${diff}d`;
  const d = parseISODate(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

function uid() {
  return (crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

/* ============================================================
   PERSISTÊNCIA
   ============================================================ */

async function loadUserData(uid) {
  // 1) Tenta buscar os dados desta pessoa no Firestore (a nuvem).
  try {
    const ref = doc(db, "susyCalendarData", uid);
    const snap = await getDoc(ref);
    if (snap.exists() && typeof snap.data()?.payload === "string") {
      return JSON.parse(snap.data().payload);
    }
  } catch (e) {
    console.error("Falha ao carregar dados do Firestore", e);
  }
  // 2) Ainda não existe nada na nuvem para esta conta: aproveita dados antigos
  //    salvos neste navegador (versão anterior, sem login) como migração única.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = JSON.parse(raw);
      await persistUserData(uid, migrated);
      return migrated;
    }
  } catch (e) {
    console.error("Falha ao migrar dados locais", e);
  }
  return emptyData;
}

async function persistUserData(uid, data) {
  try {
    const ref = doc(db, "susyCalendarData", uid);
    await setDoc(ref, { payload: JSON.stringify(data), updatedAt: Date.now() });
  } catch (e) {
    console.error("Falha ao salvar no Firestore", e);
  }
}

const emptyData = { accounts: [], projects: [], items: [] };

/* ============================================================
   PRIMITIVOS DE UI
   ============================================================ */

function IconBtn({ icon: Icon, onClick, title, danger }) {
  return (
    <button
      className={`iconbtn ${danger ? "iconbtn-danger" : ""}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Icon size={15} />
    </button>
  );
}

function Empty({ text, cta, onCta }) {
  return (
    <div className="empty">
      <p>{text}</p>
      {cta && (
        <button className="btn btn-primary" onClick={onCta} type="button">
          <Plus size={15} /> {cta}
        </button>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-panel ${wide ? "modal-wide" : ""}`} ref={ref}>
        <div className="modal-head">
          <h3>{title}</h3>
          <IconBtn icon={X} onClick={onClose} title="Fechar" />
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function LinksEditor({ links, setLinks }) {
  const update = (i, field, val) => {
    const next = links.slice();
    next[i] = { ...next[i], [field]: val };
    setLinks(next);
  };
  const remove = (i) => setLinks(links.filter((_, idx) => idx !== i));
  return (
    <div className="links-editor">
      {links.map((l, i) => (
        <div className="link-row" key={i}>
          <input
            placeholder="Nome (ex: Canva)"
            value={l.label}
            onChange={(e) => update(i, "label", e.target.value)}
          />
          <input
            placeholder="https://…"
            value={l.url}
            onChange={(e) => update(i, "url", e.target.value)}
          />
          <IconBtn icon={Trash2} onClick={() => remove(i)} title="Remover link" danger />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => setLinks([...links, { label: "", url: "" }])}
      >
        <Plus size={13} /> Adicionar link
      </button>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */

export default function App() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const skipSave = useRef(true);

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [signInError, setSignInError] = useState(null);
  const [signingIn, setSigningIn] = useState(false);

  const [nav, setNav] = useState({ screen: "main" }); // main | accounts | account | project
  const [highlightId, setHighlightId] = useState(null);

  const [accountModal, setAccountModal] = useState(null); // null | {} | account
  const [projectModal, setProjectModal] = useState(null); // null | {accountId, status?} | project
  const [itemModal, setItemModal] = useState(null); // null | {type, accountId, projectId?} | item
  const [confirmState, setConfirmState] = useState(null); // null | {message, onConfirm}

  function askConfirm(message, onConfirm) {
    setConfirmState({ message, onConfirm });
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
      if (!firebaseUser) {
        skipSave.current = true;
        setData(emptyData);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const loaded = await loadUserData(user.uid);
      if (cancelled) return;
      skipSave.current = true;
      setData(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (loading || !user) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    persistUserData(user.uid, data);
  }, [data, loading, user]);

  async function handleSignIn() {
    setSignInError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
      setSignInError("Não foi possível entrar com o Google. Tente novamente.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setNav({ screen: "main" });
  }

  const today = useMemo(() => startOfDay(new Date()), []);

  /* ---------- helpers de dados ---------- */

  const getAccount = (id) => data.accounts.find((a) => a.id === id);
  const getProject = (id) => data.projects.find((p) => p.id === id);

  const addAccount = (acc) => setData((d) => ({ ...d, accounts: [...d.accounts, acc] }));
  const updateAccount = (acc) =>
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === acc.id ? acc : a)) }));
  const deleteAccount = (id) =>
    setData((d) => ({
      accounts: d.accounts.filter((a) => a.id !== id),
      projects: d.projects.filter((p) => p.accountId !== id),
      items: d.items.filter((i) => i.accountId !== id),
    }));

  const addProject = (p) => setData((d) => ({ ...d, projects: [...d.projects, p] }));
  const updateProject = (p) =>
    setData((d) => ({ ...d, projects: d.projects.map((x) => (x.id === p.id ? p : x)) }));
  const deleteProject = (id) =>
    setData((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      items: d.items.map((i) => (i.projectId === id ? { ...i, projectId: null } : i)),
    }));

  const addItem = (it) => setData((d) => ({ ...d, items: [...d.items, it] }));
  const updateItem = (it) =>
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? it : x)) }));
  const deleteItem = (id) => setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
  const toggleDone = (it) => updateItem({ ...it, done: !it.done });

  /* ---------- navegação a partir de qualquer item ---------- */

  function goToItem(item) {
    if (item.projectId) {
      setNav({ screen: "project", accountId: item.accountId, projectId: item.projectId, tab: tabForType(item.type) });
    } else {
      setNav({ screen: "account", accountId: item.accountId, tab: tabForType(item.type) });
    }
    setHighlightId(item.id);
    setTimeout(() => setHighlightId(null), 2400);
  }
  function tabForType(type) {
    if (type === "tarefa") return "tarefas";
    if (type === "conteudo") return "conteudos";
    if (type === "ideia") return "ideias";
    if (type === "evento") return "calendario";
    return "materiais";
  }

  /* ---------- mainboard: itens urgentes / próximos ---------- */

  const board = useMemo(() => {
    const overdue = [];
    const now = [];
    const upcoming = [];
    for (const item of data.items) {
      if (item.type === "ideia" || item.type === "material") continue;
      if (item.done) continue;
      const acc = getAccount(item.accountId);
      if (!acc) continue;
      if (item.date) {
        const diff = daysBetween(today, parseISODate(item.date));
        if (diff < 0) overdue.push(item);
        else if (diff === 0) now.push(item);
        else if (diff <= 7) upcoming.push(item);
      } else if (item.type === "tarefa" && item.urgent) {
        overdue.push(item);
      }
    }
    const byDate = (a, b) => (a.date || "9999").localeCompare(b.date || "9999");
    overdue.sort(byDate);
    now.sort(byDate);
    upcoming.sort(byDate);
    return { overdue, now, upcoming };
  }, [data, today]);

  /* ---------- render ---------- */

  if (!authChecked) {
    return (
      <div className="app-shell">
        <GlobalStyle />
        <div className="loading-screen">Carregando…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <GlobalStyle />
        <div className="login-screen">
          <div className="login-card">
            <div className="brand login-brand">Susy Calendar</div>
            <p className="login-copy">Entre com sua conta Google para acessar suas contas, projetos, tarefas e ideias — de qualquer dispositivo.</p>
            <button className="btn btn-primary login-btn" onClick={handleSignIn} disabled={signingIn} type="button">
              {signingIn ? "Entrando…" : "Entrar com Google"}
            </button>
            {signInError && <p className="login-error">{signInError}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-shell">
        <GlobalStyle />
        <div className="loading-screen">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <GlobalStyle />
      <Sidebar
        data={data}
        nav={nav}
        setNav={setNav}
        onNewAccount={() => setAccountModal({})}
        user={user}
        onSignOut={handleSignOut}
      />
      <main className="main-area">
        {nav.screen === "main" && (
          <Mainboard
            today={today}
            board={board}
            getAccount={getAccount}
            getProject={getProject}
            goToItem={goToItem}
            toggleDone={toggleDone}
            hasAccounts={data.accounts.length > 0}
            goAccounts={() => setNav({ screen: "accounts" })}
          />
        )}
        {nav.screen === "accounts" && (
          <AccountsGrid
            accounts={data.accounts}
            data={data}
            onOpen={(id) => setNav({ screen: "account", accountId: id, tab: "projetos" })}
            onNew={() => setAccountModal({})}
          />
        )}
        {nav.screen === "account" && (
          <AccountView
            account={getAccount(nav.accountId)}
            data={data}
            nav={nav}
            setNav={setNav}
            highlightId={highlightId}
            today={today}
            onEditAccount={(a) => setAccountModal(a)}
            onDeleteAccount={(id) => {
              deleteAccount(id);
              setNav({ screen: "accounts" });
            }}
            askConfirm={askConfirm}
            onNewProject={(status) => setProjectModal({ accountId: nav.accountId, status })}
            onOpenProject={(p) => setNav({ screen: "project", accountId: p.accountId, projectId: p.id, tab: "conteudos" })}
            onEditProject={(p) => setProjectModal(p)}
            onMoveProject={(p, dir) => {
              const idx = PROJECT_STAGES.findIndex((s) => s.key === p.status);
              const next = PROJECT_STAGES[idx + dir];
              if (next) updateProject({ ...p, status: next.key });
            }}
            onNewItem={(type, extra) => setItemModal({ type, accountId: nav.accountId, ...extra })}
            onEditItem={(it) => setItemModal(it)}
            toggleDone={toggleDone}
          />
        )}
        {nav.screen === "project" && (
          <ProjectView
            project={getProject(nav.projectId)}
            account={getAccount(nav.accountId)}
            data={data}
            nav={nav}
            setNav={setNav}
            highlightId={highlightId}
            today={today}
            onBack={() => setNav({ screen: "account", accountId: nav.accountId, tab: "projetos" })}
            onEditProject={(p) => setProjectModal(p)}
            onDeleteProject={(id) => {
              deleteProject(id);
              setNav({ screen: "account", accountId: nav.accountId, tab: "projetos" });
            }}
            onMoveProject={(p, dir) => {
              const idx = PROJECT_STAGES.findIndex((s) => s.key === p.status);
              const next = PROJECT_STAGES[idx + dir];
              if (next) updateProject({ ...p, status: next.key });
            }}
            onNewItem={(type) => setItemModal({ type, accountId: nav.accountId, projectId: nav.projectId })}
            onEditItem={(it) => setItemModal(it)}
            toggleDone={toggleDone}
            askConfirm={askConfirm}
          />
        )}
      </main>

      {accountModal && (
        <AccountModal
          account={accountModal}
          onClose={() => setAccountModal(null)}
          onSave={(a) => {
            if (a.isNew) addAccount(a);
            else updateAccount(a);
            setAccountModal(null);
          }}
          onDelete={(id) => {
            deleteAccount(id);
            setAccountModal(null);
            if (nav.accountId === id) setNav({ screen: "accounts" });
          }}
          askConfirm={askConfirm}
        />
      )}

      {projectModal && (
        <ProjectModal
          project={projectModal}
          onClose={() => setProjectModal(null)}
          onSave={(p) => {
            if (p.isNew) addProject(p);
            else updateProject(p);
            setProjectModal(null);
          }}
          onDelete={(id) => {
            deleteProject(id);
            setProjectModal(null);
            if (nav.screen === "project" && nav.projectId === id) {
              setNav({ screen: "account", accountId: nav.accountId, tab: "projetos" });
            }
          }}
        />
      )}

      {itemModal && (
        <ItemModal
          item={itemModal}
          projects={data.projects.filter((p) => p.accountId === itemModal.accountId)}
          onClose={() => setItemModal(null)}
          onSave={(it) => {
            if (it.isNew) addItem(it);
            else updateItem(it);
            setItemModal(null);
          }}
          onDelete={(id) => {
            deleteItem(id);
            setItemModal(null);
          }}
          askConfirm={askConfirm}
        />
      )}

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            confirmState.onConfirm();
            setConfirmState(null);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   SIDEBAR
   ============================================================ */

function Sidebar({ data, nav, setNav, onNewAccount, user, onSignOut }) {
  return (
    <aside className="sidebar">
      <div className="brand">Susy Calendar</div>
      <nav className="side-nav">
        <button
          className={`side-link ${nav.screen === "main" ? "active" : ""}`}
          onClick={() => setNav({ screen: "main" })}
        >
          <Home size={16} /> Mainboard
        </button>
        <button
          className={`side-link ${nav.screen === "accounts" ? "active" : ""}`}
          onClick={() => setNav({ screen: "accounts" })}
        >
          <LayoutGrid size={16} /> Contas
        </button>
      </nav>
      <div className="side-accounts">
        <div className="side-section-label">Suas contas</div>
        {data.accounts.map((a) => (
          <button
            key={a.id}
            className={`side-account ${nav.accountId === a.id ? "active" : ""}`}
            onClick={() => setNav({ screen: "account", accountId: a.id, tab: "projetos" })}
          >
            <span className="dot" style={{ background: a.color }} />
            {a.name}
          </button>
        ))}
      </div>
      <button className="btn btn-primary side-new" onClick={onNewAccount} type="button">
        <Plus size={15} /> Nova conta
      </button>
      <div className="side-user">
        <span className="side-user-email" title={user?.email || ""}>{user?.email}</span>
        <button className="side-signout" onClick={onSignOut} type="button">Sair</button>
      </div>
    </aside>
  );
}

/* ============================================================
   MAINBOARD
   ============================================================ */

function Mainboard({ today, board, getAccount, getProject, goToItem, toggleDone, hasAccounts, goAccounts }) {
  const weekday = WEEKDAYS[today.getDay()];
  const fullWeekday = { Dom: "Domingo", Seg: "Segunda-feira", Ter: "Terça-feira", Qua: "Quarta-feira", Qui: "Quinta-feira", Sex: "Sexta-feira", Sáb: "Sábado" }[weekday];
  const totalCount = board.overdue.length + board.now.length + board.upcoming.length;

  return (
    <div className="screen">
      <div className="hero">
        <div className="hero-day">{today.getDate()}</div>
        <div className="hero-meta">
          <div className="hero-weekday">{fullWeekday}</div>
          <div className="hero-month">{MONTHS[today.getMonth()]} de {today.getFullYear()}</div>
        </div>
      </div>

      {!hasAccounts ? (
        <Empty
          text="Nenhuma conta ainda. Crie sua primeira conta para começar a organizar projetos, conteúdos e tarefas."
          cta="Ir para Contas"
          onCta={goAccounts}
        />
      ) : totalCount === 0 ? (
        <div className="empty">
          <p>Nada urgente ou próximo agora. Tudo em ordem — o resto está guardado no calendário de cada projeto.</p>
        </div>
      ) : (
        <>
          <BoardSection
            title="Urgente"
            items={board.overdue}
            tone="urgent"
            today={today}
            getAccount={getAccount}
            getProject={getProject}
            goToItem={goToItem}
            toggleDone={toggleDone}
          />
          <BoardSection
            title="Hoje"
            items={board.now}
            tone="today"
            today={today}
            getAccount={getAccount}
            getProject={getProject}
            goToItem={goToItem}
            toggleDone={toggleDone}
          />
          <BoardSection
            title="Próximos 7 dias"
            items={board.upcoming}
            tone="upcoming"
            today={today}
            getAccount={getAccount}
            getProject={getProject}
            goToItem={goToItem}
            toggleDone={toggleDone}
          />
        </>
      )}
    </div>
  );
}

function BoardSection({ title, items, tone, today, getAccount, getProject, goToItem, toggleDone }) {
  if (items.length === 0) return null;
  return (
    <section className="board-section">
      <h2 className={`board-title tone-${tone}`}>{title}</h2>
      <div className="board-list">
        {items.map((item) => {
          const acc = getAccount(item.accountId);
          const proj = item.projectId ? getProject(item.projectId) : null;
          const Icon = ITEM_TYPE_META[item.type].icon;
          return (
            <div className="board-row" key={item.id}>
              <span className="row-bar" style={{ background: acc?.color }} />
              {item.type === "tarefa" ? (
                <button
                  className="row-check"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDone(item);
                  }}
                  title="Concluir tarefa"
                  type="button"
                >
                  {item.done ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              ) : (
                <Icon size={16} className="row-icon" />
              )}
              <div className="row-main" onClick={() => goToItem(item)}>
                <div className="row-title">{item.title}</div>
                <div className="row-meta">
                  {acc?.name}
                  {proj ? ` • ${proj.title}` : ""}
                  {item.date ? ` • ${formatRelative(item.date, today)}` : " • sem data"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   CONTAS (GRID)
   ============================================================ */

function AccountsGrid({ accounts, data, onOpen, onNew }) {
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Contas</h1>
        <button className="btn btn-primary" onClick={onNew} type="button">
          <Plus size={15} /> Adicionar conta
        </button>
      </div>
      {accounts.length === 0 ? (
        <Empty text="Nenhuma conta criada ainda." cta="Adicionar conta" onCta={onNew} />
      ) : (
        <div className="account-grid">
          {accounts.map((a) => {
            const projects = data.projects.filter((p) => p.accountId === a.id);
            const pendingTasks = data.items.filter(
              (i) => i.accountId === a.id && i.type === "tarefa" && !i.done
            ).length;
            return (
              <button className="account-card" key={a.id} onClick={() => onOpen(a.id)} type="button">
                <span className="account-card-dot" style={{ background: a.color }} />
                <div className="account-card-name">{a.name}</div>
                <div className="account-card-meta">
                  {projects.length} projeto{projects.length === 1 ? "" : "s"} · {pendingTasks} tarefa
                  {pendingTasks === 1 ? "" : "s"} pendente{pendingTasks === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ACCOUNT VIEW
   ============================================================ */

function AccountView({
  account, data, nav, setNav, highlightId, today,
  onEditAccount, onDeleteAccount, onNewProject, onOpenProject, onEditProject, onMoveProject,
  onNewItem, onEditItem, toggleDone, askConfirm,
}) {
  if (!account) return <Empty text="Conta não encontrada." />;
  const tab = nav.tab || "projetos";
  const setTab = (t) => setNav({ ...nav, tab: t });

  const projects = data.projects.filter((p) => p.accountId === account.id);
  const items = data.items.filter((i) => i.accountId === account.id);

  return (
    <div className="screen">
      <div className="entity-head">
        <div>
          <div className="entity-eyebrow">
            <span className="dot" style={{ background: account.color }} /> Conta
          </div>
          <h1>{account.name}</h1>
        </div>
        <div className="entity-actions">
          <IconBtn icon={Pencil} onClick={() => onEditAccount(account)} title="Editar conta" />
          <IconBtn
            icon={Trash2}
            danger
            title="Excluir conta"
            onClick={() =>
              askConfirm(
                `Excluir a conta "${account.name}" e tudo dentro dela? Isso apaga também seus projetos, conteúdos, tarefas e ideias.`,
                () => onDeleteAccount(account.id)
              )
            }
          />
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === "projetos" && (
        <ProjectsKanban
          projects={projects}
          items={items}
          onNew={onNewProject}
          onOpen={onOpenProject}
          onMove={onMoveProject}
        />
      )}
      {tab === "conteudos" && (
        <ContentList
          items={items.filter((i) => i.type === "conteudo")}
          projects={projects}
          today={today}
          highlightId={highlightId}
          onNew={() => onNewItem("conteudo")}
          onEdit={onEditItem}
        />
      )}
      {tab === "tarefas" && (
        <TaskList
          items={items.filter((i) => i.type === "tarefa")}
          projects={projects}
          today={today}
          highlightId={highlightId}
          onNew={() => onNewItem("tarefa")}
          onEdit={onEditItem}
          toggleDone={toggleDone}
        />
      )}
      {tab === "ideias" && (
        <IdeasBoard
          items={items.filter((i) => i.type === "ideia")}
          highlightId={highlightId}
          onNew={() => onNewItem("ideia")}
          onEdit={onEditItem}
        />
      )}
      {tab === "calendario" && (
        <CalendarView
          items={items.filter((i) => i.date)}
          projects={projects}
          today={today}
          onEdit={onEditItem}
        />
      )}
      {tab === "materiais" && (
        <MaterialsList
          items={items.filter((i) => i.type === "material")}
          projects={projects}
          highlightId={highlightId}
          onNew={() => onNewItem("material")}
          onEdit={onEditItem}
        />
      )}
    </div>
  );
}

/* ============================================================
   PROJECT VIEW
   ============================================================ */

function ProjectView({
  project, account, data, nav, setNav, highlightId, today,
  onBack, onEditProject, onDeleteProject, onMoveProject, onNewItem, onEditItem, toggleDone, askConfirm,
}) {
  if (!project) return <Empty text="Projeto não encontrado." />;
  const tab = nav.tab || "conteudos";
  const setTab = (t) => setNav({ ...nav, tab: t });
  const items = data.items.filter((i) => i.projectId === project.id);
  const stage = PROJECT_STAGES.find((s) => s.key === project.status);
  const stageIdx = PROJECT_STAGES.findIndex((s) => s.key === project.status);

  return (
    <div className="screen">
      <button className="back-link" onClick={onBack} type="button">
        <ArrowLeft size={14} /> {account?.name}
      </button>

      <div className="entity-head">
        <div>
          <div className="entity-eyebrow">
            <span className="dot" style={{ background: account?.color }} /> Projeto
          </div>
          <h1>{project.title}</h1>
          {project.description && <p className="entity-desc">{project.description}</p>}
        </div>
        <div className="entity-actions">
          <IconBtn icon={Pencil} onClick={() => onEditProject(project)} title="Editar projeto" />
          <IconBtn
            icon={Trash2}
            danger
            title="Excluir projeto"
            onClick={() =>
              askConfirm(`Excluir o projeto "${project.title}"? Isso apaga também seus conteúdos, tarefas e ideias.`, () =>
                onDeleteProject(project.id)
              )
            }
          />
        </div>
      </div>

      <div className="stage-control">
        <IconBtn icon={ChevronLeft} onClick={() => onMoveProject(project, -1)} title="Mover para trás" />
        <span className={`stage-pill stage-${project.status}`}>{stage?.label}</span>
        <IconBtn icon={ChevronRight} onClick={() => onMoveProject(project, 1)} title="Mover para frente" />
      </div>

      <TabBar tabs={PROJECT_TABS} active={tab} onChange={setTab} />

      {tab === "conteudos" && (
        <ContentList
          items={items.filter((i) => i.type === "conteudo")}
          projects={[project]}
          today={today}
          highlightId={highlightId}
          onNew={() => onNewItem("conteudo")}
          onEdit={onEditItem}
          hideProject
        />
      )}
      {tab === "tarefas" && (
        <TaskList
          items={items.filter((i) => i.type === "tarefa")}
          projects={[project]}
          today={today}
          highlightId={highlightId}
          onNew={() => onNewItem("tarefa")}
          onEdit={onEditItem}
          toggleDone={toggleDone}
          hideProject
        />
      )}
      {tab === "ideias" && (
        <IdeasBoard
          items={items.filter((i) => i.type === "ideia")}
          highlightId={highlightId}
          onNew={() => onNewItem("ideia")}
          onEdit={onEditItem}
        />
      )}
      {tab === "calendario" && (
        <CalendarView items={items.filter((i) => i.date)} projects={[project]} today={today} onEdit={onEditItem} />
      )}
      {tab === "materiais" && (
        <MaterialsList
          items={items.filter((i) => i.type === "material")}
          projects={[project]}
          highlightId={highlightId}
          onNew={() => onNewItem("material")}
          onEdit={onEditItem}
          hideProject
        />
      )}
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tab-btn ${active === t.key ? "active" : ""}`}
          onClick={() => onChange(t.key)}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   PROJETOS — KANBAN
   ============================================================ */

function ProjectsKanban({ projects, items, onNew, onOpen, onMove }) {
  return (
    <div className="kanban">
      {PROJECT_STAGES.map((stage, stageIdx) => {
        const stageProjects = projects.filter((p) => p.status === stage.key);
        return (
          <div className="kanban-col" key={stage.key}>
            <div className="kanban-col-head">
              <h3>{stage.label}</h3>
              <span className="count-badge">{stageProjects.length}</span>
            </div>
            <div className="kanban-col-body">
              {stageProjects.map((p) => {
                const pending = items.filter(
                  (i) => i.projectId === p.id && i.type === "tarefa" && !i.done
                ).length;
                return (
                  <div className="kanban-card" key={p.id}>
                    <div className="kanban-card-body" onClick={() => onOpen(p)}>
                      <div className="kanban-card-title">{p.title}</div>
                      {p.description && <div className="kanban-card-desc">{p.description}</div>}
                      {pending > 0 && <div className="kanban-card-meta">{pending} tarefa{pending === 1 ? "" : "s"} pendente{pending === 1 ? "" : "s"}</div>}
                    </div>
                    <div className="kanban-card-controls">
                      <IconBtn
                        icon={ChevronLeft}
                        onClick={() => onMove(p, -1)}
                        title="Mover para trás"
                      />
                      <IconBtn
                        icon={ChevronRight}
                        onClick={() => onMove(p, 1)}
                        title="Mover para frente"
                      />
                    </div>
                  </div>
                );
              })}
              <button className="btn btn-ghost btn-small kanban-add" onClick={() => onNew(stage.key)} type="button">
                <Plus size={13} /> Novo projeto
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   CONTEÚDOS
   ============================================================ */

function ContentList({ items, projects, today, highlightId, onNew, onEdit, hideProject }) {
  const sorted = items.slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  return (
    <div className="list-section">
      <div className="list-head">
        <button className="btn btn-primary btn-small" onClick={onNew} type="button">
          <Plus size={14} /> Novo conteúdo
        </button>
      </div>
      {sorted.length === 0 ? (
        <Empty text="Nenhum conteúdo cadastrado ainda." />
      ) : (
        <div className="row-list">
          {sorted.map((it) => {
            const proj = projects.find((p) => p.id === it.projectId);
            const status = CONTENT_STATUS.find((s) => s.key === it.status);
            return (
              <div
                key={it.id}
                className={`entity-row ${highlightId === it.id ? "highlight" : ""}`}
                onClick={() => onEdit(it)}
              >
                <ImageIcon size={16} className="row-icon" />
                <div className="row-main">
                  <div className="row-title">{it.title}</div>
                  <div className="row-meta">
                    {!hideProject && proj ? `${proj.title} • ` : ""}
                    {it.date ? formatRelative(it.date, today) : "sem data"}
                    {it.links?.length ? ` • ${it.links.length} link${it.links.length === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                {status && <span className={`status-pill status-${status.key}`}>{status.label}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TAREFAS
   ============================================================ */

function TaskList({ items, projects, today, highlightId, onNew, onEdit, toggleDone, hideProject }) {
  const pending = items.filter((i) => !i.done).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const done = items.filter((i) => i.done);
  return (
    <div className="list-section">
      <div className="list-head">
        <button className="btn btn-primary btn-small" onClick={onNew} type="button">
          <Plus size={14} /> Nova tarefa
        </button>
      </div>
      {items.length === 0 ? (
        <Empty text="Nenhuma tarefa cadastrada ainda." />
      ) : (
        <>
          <div className="row-list">
            {pending.map((it) => {
              const proj = projects.find((p) => p.id === it.projectId);
              return (
                <div
                  key={it.id}
                  className={`entity-row ${highlightId === it.id ? "highlight" : ""}`}
                >
                  <button
                    className="row-check"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDone(it);
                    }}
                    type="button"
                  >
                    <Square size={16} />
                  </button>
                  <div className="row-main" onClick={() => onEdit(it)}>
                    <div className="row-title">
                      {it.title} {it.urgent && <span className="urgent-flag">urgente</span>}
                    </div>
                    <div className="row-meta">
                      {!hideProject && proj ? `${proj.title} • ` : ""}
                      {it.date ? formatRelative(it.date, today) : "sem data"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {done.length > 0 && (
            <details className="done-details">
              <summary>{done.length} concluída{done.length === 1 ? "" : "s"}</summary>
              <div className="row-list">
                {done.map((it) => (
                  <div key={it.id} className="entity-row done-row">
                    <button
                      className="row-check"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDone(it);
                      }}
                      type="button"
                    >
                      <CheckSquare size={16} />
                    </button>
                    <div className="row-main" onClick={() => onEdit(it)}>
                      <div className="row-title strike">{it.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   IDEIAS — QUADRO VISUAL
   ============================================================ */

function IdeasBoard({ items, highlightId, onNew, onEdit }) {
  return (
    <div className="list-section">
      <div className="list-head">
        <button className="btn btn-primary btn-small" onClick={onNew} type="button">
          <Plus size={14} /> Nova ideia
        </button>
      </div>
      {items.length === 0 ? (
        <Empty text="Nenhuma ideia registrada ainda. Use este espaço para brainstorming livre." />
      ) : (
        <div className="idea-board">
          {items.map((it) => (
            <div
              key={it.id}
              className={`idea-card ${highlightId === it.id ? "highlight" : ""}`}
              style={{ background: it.color || IDEA_COLORS[0].hex }}
              onClick={() => onEdit(it)}
            >
              <div className="idea-title">{it.title}</div>
              {it.notes && <div className="idea-notes">{it.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CALENDÁRIO
   ============================================================ */

function CalendarView({ items, projects, today, onEdit }) {
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(toISODate(today));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const itemsByDate = useMemo(() => {
    const map = {};
    for (const it of items) {
      if (!map[it.date]) map[it.date] = [];
      map[it.date].push(it);
    }
    return map;
  }, [items]);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayItems = itemsByDate[selectedDay] || [];

  return (
    <div className="calendar">
      <div className="calendar-head">
        <IconBtn icon={ChevronLeft} onClick={() => setCursor(new Date(year, month - 1, 1))} title="Mês anterior" />
        <h3>{MONTHS[month]} {year}</h3>
        <IconBtn icon={ChevronRight} onClick={() => setCursor(new Date(year, month + 1, 1))} title="Próximo mês" />
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div className="calendar-weekday" key={w}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div className="calendar-cell empty-cell" key={`e${i}`} />;
          const iso = toISODate(new Date(year, month, d));
          const dayList = itemsByDate[iso] || [];
          const isToday = iso === toISODate(today);
          const isSelected = iso === selectedDay;
          return (
            <button
              key={iso}
              className={`calendar-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
              onClick={() => setSelectedDay(iso)}
              type="button"
            >
              <span className="cell-num">{d}</span>
              {dayList.length > 0 && (
                <span className="cell-dots">
                  {dayList.slice(0, 3).map((it, idx) => (
                    <span key={idx} className="cell-dot" />
                  ))}
                  {dayList.length > 3 && <span className="cell-more">+{dayList.length - 3}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="agenda">
        <h4>{parseISODate(selectedDay).getDate()} de {MONTHS[parseISODate(selectedDay).getMonth()]}</h4>
        {dayItems.length === 0 ? (
          <p className="agenda-empty">Nada agendado neste dia.</p>
        ) : (
          <div className="row-list">
            {dayItems.map((it) => {
              const proj = projects.find((p) => p.id === it.projectId);
              const Icon = ITEM_TYPE_META[it.type].icon;
              const evType = it.type === "evento" ? EVENT_TYPES.find((e) => e.key === it.dateType) : null;
              return (
                <div className="entity-row" key={it.id} onClick={() => onEdit(it)}>
                  <Icon size={16} className="row-icon" />
                  <div className="row-main">
                    <div className="row-title">{it.title}</div>
                    <div className="row-meta">
                      {ITEM_TYPE_META[it.type].label}
                      {evType ? ` · ${evType.label}` : ""}
                      {proj ? ` · ${proj.title}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MATERIAIS
   ============================================================ */

function MaterialsList({ items, projects, highlightId, onNew, onEdit, hideProject }) {
  return (
    <div className="list-section">
      <div className="list-head">
        <button className="btn btn-primary btn-small" onClick={onNew} type="button">
          <Plus size={14} /> Novo material
        </button>
      </div>
      {items.length === 0 ? (
        <Empty text="Nenhum material salvo ainda. Guarde aqui links (Canva, Drive, Figma, Hotmart…) ou textos importantes." />
      ) : (
        <div className="row-list">
          {items.map((it) => {
            const proj = projects.find((p) => p.id === it.projectId);
            return (
              <div
                key={it.id}
                className={`entity-row material-row ${highlightId === it.id ? "highlight" : ""}`}
              >
                <Paperclip size={16} className="row-icon" />
                <div className="row-main" onClick={() => onEdit(it)}>
                  <div className="row-title">{it.title}</div>
                  <div className="row-meta">
                    {!hideProject && proj ? `${proj.title} • ` : ""}
                    {it.notes ? it.notes.slice(0, 60) : "sem anotação"}
                  </div>
                  {it.links?.length > 0 && (
                    <div className="chip-row">
                      {it.links.map((l, i) => (
                        <a
                          key={i}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="chip"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <LinkIcon size={11} /> {l.label || l.url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MODAL: CONTA
   ============================================================ */

function AccountModal({ account, onClose, onSave, onDelete, askConfirm }) {
  const isNew = !account.id;
  const [name, setName] = useState(account.name || "");
  const [color, setColor] = useState(account.color || ACCOUNT_COLORS[0].hex);

  return (
    <Modal title={isNew ? "Nova conta" : "Editar conta"} onClose={onClose}>
      <div className="form-field">
        <label>Nome da conta / marca</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: @minhamarca" />
      </div>
      <div className="form-field">
        <label>Cor</label>
        <div className="swatches">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`swatch ${color === c.hex ? "swatch-active" : ""}`}
              style={{ background: c.hex }}
              onClick={() => setColor(c.hex)}
            />
          ))}
        </div>
      </div>
      <div className="modal-footer">
        {!isNew && (
          <button
            className="btn btn-ghost btn-danger"
            onClick={() =>
              askConfirm(
                `Excluir a conta "${account.name}" e tudo dentro dela? Isso apaga também seus projetos, conteúdos, tarefas e ideias.`,
                () => onDelete(account.id)
              )
            }
            type="button"
          >
            Excluir
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              id: account.id || uid(),
              name: name.trim(),
              color,
              isNew,
              createdAt: account.createdAt || Date.now(),
            })
          }
          type="button"
        >
          Salvar
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
   MODAL: PROJETO
   ============================================================ */

function ProjectModal({ project, onClose, onSave, onDelete, askConfirm }) {
  const isNew = !project.id;
  const [title, setTitle] = useState(project.title || "");
  const [status, setStatus] = useState(project.status || "ideias");
  const [description, setDescription] = useState(project.description || "");
  const [links, setLinks] = useState(project.links || []);

  return (
    <Modal title={isNew ? "Novo projeto" : "Editar projeto"} onClose={onClose}>
      <div className="form-field">
        <label>Título</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do projeto" />
      </div>
      <div className="form-field">
        <label>Etapa</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {PROJECT_STAGES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Descrição</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="form-field">
        <label>Links (Canva, Drive, Figma…)</label>
        <LinksEditor links={links} setLinks={setLinks} />
      </div>
      <div className="modal-footer">
        {!isNew && (
          <button
            className="btn btn-ghost btn-danger"
            onClick={() => askConfirm("Excluir este projeto? Isso apaga também seus conteúdos, tarefas e ideias.", () => onDelete(project.id))}
            type="button"
          >
            Excluir
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              id: project.id || uid(),
              accountId: project.accountId,
              title: title.trim(),
              status,
              description,
              links: links.filter((l) => l.label || l.url),
              isNew,
              createdAt: project.createdAt || Date.now(),
            })
          }
          type="button"
        >
          Salvar
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
   MODAL: ITEM (tarefa / conteúdo / ideia / evento / material)
   ============================================================ */

function ItemModal({ item, projects, onClose, onSave, onDelete, askConfirm }) {
  const isNew = !item.id;
  const type = item.type;
  const meta = ITEM_TYPE_META[type];

  const [title, setTitle] = useState(item.title || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [projectId, setProjectId] = useState(item.projectId || "");
  const [date, setDate] = useState(item.date || "");
  const [done, setDone] = useState(item.done || false);
  const [urgent, setUrgent] = useState(item.urgent || false);
  const [status, setStatus] = useState(item.status || "rascunho");
  const [dateType, setDateType] = useState(item.dateType || "deadline");
  const [color, setColor] = useState(item.color || IDEA_COLORS[0].hex);
  const [links, setLinks] = useState(item.links || []);

  const locked = !!item.projectId && !isNew && projects.length === 1;

  return (
    <Modal title={isNew ? `Novo — ${meta.label}` : `Editar — ${meta.label}`} onClose={onClose}>
      <div className="form-field">
        <label>Título</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {!locked && projects.length > 0 && (
        <div className="form-field">
          <label>Projeto (opcional)</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Geral da conta (sem projeto)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      )}

      {(type === "tarefa" || type === "conteudo" || type === "evento") && (
        <div className="form-field">
          <label>{type === "conteudo" ? "Data de publicação" : type === "evento" ? "Data" : "Prazo"}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}

      {type === "tarefa" && (
        <div className="form-field-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} /> Concluída
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgente
          </label>
        </div>
      )}

      {type === "conteudo" && (
        <div className="form-field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {CONTENT_STATUS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {type === "evento" && (
        <div className="form-field">
          <label>Tipo</label>
          <select value={dateType} onChange={(e) => setDateType(e.target.value)}>
            {EVENT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      {type === "ideia" && (
        <div className="form-field">
          <label>Cor</label>
          <div className="swatches">
            {IDEA_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`swatch ${color === c.hex ? "swatch-active" : ""}`}
                style={{ background: c.hex }}
                onClick={() => setColor(c.hex)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="form-field">
        <label>Anotações</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      {(type === "conteudo" || type === "material" || type === "evento") && (
        <div className="form-field">
          <label>Links (Canva, Drive, Figma, Hotmart…)</label>
          <LinksEditor links={links} setLinks={setLinks} />
        </div>
      )}

      <div className="modal-footer">
        {!isNew && (
          <button
            className="btn btn-ghost btn-danger"
            onClick={() => askConfirm("Excluir este item?", () => onDelete(item.id))}
            type="button"
          >
            Excluir
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              id: item.id || uid(),
              type,
              accountId: item.accountId,
              projectId: projectId || null,
              title: title.trim(),
              notes,
              date: date || null,
              done,
              urgent,
              status,
              dateType,
              color,
              links: links.filter((l) => l.label || l.url),
              isNew,
              createdAt: item.createdAt || Date.now(),
            })
          }
          type="button"
        >
          Salvar
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
   MODAL: CONFIRMAÇÃO
   ============================================================ */

function ConfirmModal({ message, onCancel, onConfirm }) {
  return (
    <Modal title="Confirmar exclusão" onClose={onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="btn btn-danger-solid" onClick={onConfirm} type="button">
          Excluir
        </button>
      </div>
    </Modal>
  );
}

/* ============================================================
   ESTILOS
   ============================================================ */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');

      :root {
        --bg: #EFF1E7;
        --surface: #FBFBF6;
        --ink: #1E241F;
        --ink-soft: #55604F;
        --line: #D7DBC7;
        --accent: #3F6C51;
        --accent-soft: #E4EBDD;
        --urgent: #B3452C;
        --urgent-soft: #F3DFD6;
        --warn: #A9782B;
        --warn-soft: #F1E3C6;
        --sidebar-bg: #1E241F;
        --sidebar-ink: #E7E9DE;
      }

      * { box-sizing: border-box; }

      .app-shell {
        display: flex;
        min-height: 100vh;
        width: 100%;
        background: var(--bg);
        color: var(--ink);
        font-family: 'Inter', sans-serif;
      }

      .loading-screen {
        display: flex; align-items: center; justify-content: center;
        width: 100%; height: 100vh; color: var(--ink-soft); font-size: 14px;
      }

      .login-screen {
        display: flex; align-items: center; justify-content: center;
        width: 100%; height: 100vh; padding: 20px;
      }
      .login-card {
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
        padding: 34px 30px; max-width: 360px; width: 100%; text-align: center;
      }
      .login-brand { font-size: 22px; margin-bottom: 12px; }
      .login-copy { font-size: 13.5px; color: var(--ink-soft); margin: 0 0 20px; line-height: 1.5; }
      .login-btn { width: 100%; justify-content: center; }
      .login-error { font-size: 12.5px; color: var(--urgent); margin: 14px 0 0; }

      /* ---------- Sidebar ---------- */

      .sidebar {
        width: 220px;
        flex-shrink: 0;
        background: var(--sidebar-bg);
        color: var(--sidebar-ink);
        display: flex;
        flex-direction: column;
        padding: 20px 14px;
        gap: 18px;
        position: sticky;
        top: 0;
        height: 100vh;
      }
      .brand {
        font-family: 'Fraunces', serif;
        font-size: 18px;
        font-weight: 600;
        padding: 4px 8px 8px;
        letter-spacing: 0.2px;
        line-height: 1.2;
      }
      .side-nav { display: flex; flex-direction: column; gap: 2px; }
      .side-link {
        display: flex; align-items: center; gap: 9px;
        background: none; border: none; color: var(--sidebar-ink);
        opacity: 0.75; font-size: 13.5px; padding: 8px 8px; border-radius: 7px;
        cursor: pointer; text-align: left; font-family: inherit;
      }
      .side-link:hover { opacity: 1; background: rgba(255,255,255,0.06); }
      .side-link.active { opacity: 1; background: rgba(255,255,255,0.1); }
      .side-accounts { flex: 1; overflow-y: auto; margin-top: 4px; }
      .side-section-label {
        font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em;
        opacity: 0.45; padding: 6px 8px 6px;
      }
      .side-account {
        display: flex; align-items: center; gap: 9px; width: 100%;
        background: none; border: none; color: var(--sidebar-ink);
        font-size: 13px; padding: 7px 8px; border-radius: 7px; cursor: pointer;
        text-align: left; opacity: 0.8; font-family: inherit;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .side-account:hover { opacity: 1; background: rgba(255,255,255,0.06); }
      .side-account.active { opacity: 1; background: rgba(255,255,255,0.1); }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
      .side-new { width: 100%; justify-content: center; }
      .side-user {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);
      }
      .side-user-email {
        font-size: 11px; color: var(--sidebar-ink); opacity: 0.55;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .side-signout {
        background: none; border: none; color: var(--sidebar-ink); opacity: 0.7;
        font-size: 11.5px; font-weight: 600; cursor: pointer; padding: 2px 4px; flex-shrink: 0;
        font-family: inherit;
      }
      .side-signout:hover { opacity: 1; text-decoration: underline; }

      /* ---------- Main area ---------- */

      .main-area { flex: 1; min-width: 0; padding: 36px 44px 60px; }
      .screen { max-width: 900px; margin: 0 auto; }
      .screen-head {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px;
      }
      .screen-head h1 { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; margin: 0; }

      /* ---------- Hero (mainboard) ---------- */

      .hero { display: flex; align-items: baseline; gap: 16px; margin-bottom: 28px; }
      .hero-day {
        font-family: 'Fraunces', serif; font-size: 74px; font-weight: 600; line-height: 1;
        color: var(--ink);
      }
      .hero-meta { display: flex; flex-direction: column; gap: 2px; }
      .hero-weekday { font-size: 16px; font-weight: 600; }
      .hero-month { font-size: 13.5px; color: var(--ink-soft); }

      /* ---------- Buttons ---------- */

      .btn {
        display: inline-flex; align-items: center; gap: 6px;
        font-family: 'Inter', sans-serif; font-size: 13.5px; font-weight: 600;
        padding: 9px 15px; border-radius: 8px; border: 1px solid transparent;
        cursor: pointer; transition: background 0.12s, border-color 0.12s;
      }
      .btn-small { font-size: 12.5px; padding: 6px 11px; }
      .btn-primary { background: var(--accent); color: #fff; }
      .btn-primary:hover { background: #365d45; }
      .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn-ghost { background: transparent; color: var(--ink-soft); border-color: var(--line); }
      .btn-ghost:hover { background: var(--surface); color: var(--ink); }
      .btn-danger { color: var(--urgent); }
      .btn-danger-solid { background: var(--urgent); color: #fff; }
      .btn-danger-solid:hover { background: #96391f; }
      .confirm-message { font-size: 13.5px; color: var(--ink-soft); line-height: 1.5; margin: 0 0 18px; }

      .iconbtn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--line);
        background: var(--surface); color: var(--ink-soft); cursor: pointer;
      }
      .iconbtn:hover { color: var(--ink); border-color: var(--ink-soft); }
      .iconbtn-danger:hover { color: var(--urgent); border-color: var(--urgent); }

      /* ---------- Empty state ---------- */

      .empty {
        border: 1px dashed var(--line); border-radius: 10px; padding: 34px 24px;
        text-align: center; color: var(--ink-soft); font-size: 14px;
        display: flex; flex-direction: column; align-items: center; gap: 14px;
      }

      /* ---------- Board sections (mainboard) ---------- */

      .board-section { margin-bottom: 26px; }
      .board-title {
        font-family: 'Fraunces', serif; font-size: 15.5px; font-weight: 600;
        margin: 0 0 10px; padding-left: 2px;
      }
      .tone-urgent { color: var(--urgent); }
      .tone-today { color: var(--ink); }
      .tone-upcoming { color: var(--warn); }

      .board-list { display: flex; flex-direction: column; gap: 6px; }
      .board-row {
        display: flex; align-items: center; gap: 10px;
        background: var(--surface); border: 1px solid var(--line); border-radius: 9px;
        padding: 10px 12px; position: relative; overflow: hidden;
      }
      .row-bar { width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0; }
      .row-check {
        background: none; border: none; cursor: pointer; color: var(--ink-soft);
        display: flex; align-items: center; padding: 2px; flex-shrink: 0;
      }
      .row-check:hover { color: var(--accent); }
      .row-icon { color: var(--ink-soft); flex-shrink: 0; }
      .row-main { flex: 1; min-width: 0; cursor: pointer; }
      .row-title { font-size: 13.5px; font-weight: 600; }
      .row-meta { font-size: 12px; color: var(--ink-soft); margin-top: 1px; }
      .urgent-flag {
        font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
        color: var(--urgent); font-weight: 700; margin-left: 6px;
      }

      /* ---------- Accounts grid ---------- */

      .account-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
      .account-card {
        text-align: left; background: var(--surface); border: 1px solid var(--line);
        border-radius: 10px; padding: 16px; cursor: pointer; font-family: inherit;
      }
      .account-card:hover { border-color: var(--ink-soft); }
      .account-card-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-bottom: 10px; }
      .account-card-name { font-family: 'Fraunces', serif; font-size: 16.5px; font-weight: 600; }
      .account-card-meta { font-size: 12px; color: var(--ink-soft); margin-top: 4px; }

      /* ---------- Entity head (account / project) ---------- */

      .back-link {
        display: inline-flex; align-items: center; gap: 6px; background: none; border: none;
        color: var(--ink-soft); font-size: 13px; cursor: pointer; padding: 0; margin-bottom: 14px;
        font-family: inherit;
      }
      .back-link:hover { color: var(--ink); }
      .entity-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
      .entity-eyebrow {
        display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--ink-soft);
        text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;
      }
      .entity-head h1 { font-family: 'Fraunces', serif; font-size: 25px; font-weight: 600; margin: 0; }
      .entity-desc { font-size: 13.5px; color: var(--ink-soft); margin: 6px 0 0; max-width: 60ch; }
      .entity-actions { display: flex; gap: 6px; flex-shrink: 0; }

      .stage-control { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
      .stage-pill {
        font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 20px;
        background: var(--accent-soft); color: var(--accent);
      }

      /* ---------- Tabs ---------- */

      .tab-bar { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
      .tab-btn {
        background: none; border: none; font-family: inherit; font-size: 13px; font-weight: 600;
        color: var(--ink-soft); padding: 9px 12px; cursor: pointer; border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }
      .tab-btn:hover { color: var(--ink); }
      .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

      /* ---------- List section ---------- */

      .list-section { }
      .list-head { display: flex; justify-content: flex-end; margin-bottom: 12px; }
      .row-list { display: flex; flex-direction: column; gap: 6px; }
      .entity-row {
        display: flex; align-items: flex-start; gap: 10px; background: var(--surface);
        border: 1px solid var(--line); border-radius: 9px; padding: 11px 13px; cursor: pointer;
      }
      .entity-row:hover { border-color: var(--ink-soft); }
      .entity-row.highlight { border-color: var(--accent); background: var(--accent-soft); }
      .entity-row.done-row { opacity: 0.6; }
      .strike { text-decoration: line-through; }
      .done-details { margin-top: 12px; }
      .done-details summary { font-size: 12.5px; color: var(--ink-soft); cursor: pointer; margin-bottom: 8px; }

      .status-pill {
        font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; align-self: center;
        background: var(--accent-soft); color: var(--accent); white-space: nowrap; flex-shrink: 0;
      }
      .status-rascunho { background: #EDEAE0; color: #6B6350; }
      .status-producao { background: var(--warn-soft); color: var(--warn); }
      .status-agendado { background: #DCE6EE; color: #2E6E7E; }
      .status-publicado { background: var(--accent-soft); color: var(--accent); }

      .material-row { align-items: flex-start; }
      .chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
      .chip {
        display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px;
        background: var(--accent-soft); color: var(--accent); padding: 3px 9px; border-radius: 20px;
        text-decoration: none; font-weight: 600;
      }
      .chip:hover { background: #d5e2ca; }

      /* ---------- Kanban ---------- */

      .kanban { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      .kanban-col { background: rgba(0,0,0,0.015); border-radius: 10px; padding: 10px; min-width: 0; }
      .kanban-col-head { display: flex; align-items: center; gap: 8px; padding: 4px 4px 10px; }
      .kanban-col-head h3 { font-size: 13px; font-weight: 700; margin: 0; }
      .count-badge {
        font-size: 11px; background: var(--line); color: var(--ink-soft);
        padding: 1px 7px; border-radius: 20px;
      }
      .kanban-col-body { display: flex; flex-direction: column; gap: 8px; }
      .kanban-card {
        background: var(--surface); border: 1px solid var(--line); border-radius: 9px;
        padding: 10px 11px; display: flex; flex-direction: column; gap: 8px;
      }
      .kanban-card-body { cursor: pointer; }
      .kanban-card-title { font-size: 13px; font-weight: 600; }
      .kanban-card-desc {
        font-size: 12px; color: var(--ink-soft); margin-top: 3px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .kanban-card-meta { font-size: 11px; color: var(--warn); margin-top: 5px; font-weight: 600; }
      .kanban-card-controls { display: flex; justify-content: space-between; }
      .kanban-add { justify-content: center; width: 100%; }

      /* ---------- Ideas board ---------- */

      .idea-board {
        columns: 3; column-gap: 12px;
      }
      .idea-card {
        break-inside: avoid; margin-bottom: 12px; border-radius: 9px; padding: 14px 15px;
        cursor: pointer; box-shadow: 0 1px 0 rgba(0,0,0,0.04);
      }
      .idea-card.highlight { outline: 2px solid var(--accent); }
      .idea-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 14.5px; color: #262b21; }
      .idea-notes { font-size: 12.5px; color: #454f3d; margin-top: 6px; white-space: pre-wrap; }

      /* ---------- Calendar ---------- */

      .calendar-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .calendar-head h3 { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; margin: 0; flex: 1; text-align: center; }
      .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .calendar-weekday { text-align: center; font-size: 11px; color: var(--ink-soft); font-weight: 600; padding-bottom: 4px; }
      .calendar-cell {
        aspect-ratio: 1; border-radius: 8px; border: 1px solid var(--line); background: var(--surface);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        cursor: pointer; font-family: inherit; padding: 4px;
      }
      .empty-cell { visibility: hidden; border: none; background: none; }
      .cell-num { font-size: 12.5px; }
      .calendar-cell.is-today .cell-num { font-weight: 700; color: var(--accent); }
      .calendar-cell.is-selected { border-color: var(--ink); }
      .cell-dots { display: flex; gap: 2px; align-items: center; }
      .cell-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
      .cell-more { font-size: 8.5px; color: var(--ink-soft); }
      .agenda { margin-top: 22px; }
      .agenda h4 { font-size: 13.5px; font-weight: 700; margin: 0 0 10px; }
      .agenda-empty { font-size: 13px; color: var(--ink-soft); }

      /* ---------- Modal ---------- */

      .modal-overlay {
        position: fixed; inset: 0; background: rgba(20,24,18,0.4); z-index: 50;
        display: flex; align-items: flex-start; justify-content: center; padding: 6vh 20px; overflow-y: auto;
      }
      .modal-panel {
        background: var(--surface); border-radius: 12px; width: 440px; max-width: 100%;
        box-shadow: 0 10px 40px rgba(0,0,0,0.18);
      }
      .modal-wide { width: 560px; }
      .modal-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 18px; border-bottom: 1px solid var(--line);
      }
      .modal-head h3 { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; margin: 0; }
      .modal-body { padding: 16px 18px 4px; max-height: 65vh; overflow-y: auto; }
      .modal-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px 18px; }
      .modal-footer .btn-primary { margin-left: auto; }

      .form-field { margin-bottom: 14px; display: flex; flex-direction: column; gap: 5px; }
      .form-field-row { display: flex; gap: 20px; margin-bottom: 14px; }
      .form-field label { font-size: 12px; font-weight: 600; color: var(--ink-soft); }
      .form-field input[type="text"], .form-field input:not([type]), .form-field input[type="date"],
      .form-field select, .form-field textarea {
        font-family: 'Inter', sans-serif; font-size: 13.5px; padding: 8px 10px;
        border: 1px solid var(--line); border-radius: 7px; background: #fff; color: var(--ink);
        width: 100%;
      }
      .form-field textarea { resize: vertical; font-family: inherit; }
      .checkbox-label { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 500; }

      .swatches { display: flex; gap: 8px; }
      .swatch {
        width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; cursor: pointer;
      }
      .swatch-active { border-color: var(--ink); }

      .links-editor { display: flex; flex-direction: column; gap: 7px; }
      .link-row { display: flex; gap: 6px; align-items: center; }
      .link-row input { flex: 1; font-size: 13px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 6px; }

      @media (max-width: 860px) {
        .app-shell { flex-direction: column; }
        .sidebar { width: 100%; height: auto; position: relative; flex-direction: row; flex-wrap: wrap; }
        .side-accounts { display: none; }
        .main-area { padding: 24px 18px 50px; }
        .kanban { grid-template-columns: 1fr; }
        .idea-board { columns: 1; }
        .account-grid { grid-template-columns: 1fr 1fr; }

        /* Ajustes de área de toque (sin cambios visuales de diseño) */
        .side-link, .side-new { min-height: 40px; }
        .iconbtn { width: 34px; height: 34px; }
        .row-check { padding: 6px; }
        .tab-btn { padding: 11px 13px; }
        .swatch { width: 30px; height: 30px; }
        .checkbox-label { padding: 4px 0; }
        .btn, .btn-small { min-height: 38px; }
        .calendar-cell { min-height: 40px; }

        /* Evita que iOS haga zoom automático al enfocar campos de formulario */
        .form-field input, .form-field select, .form-field textarea, .link-row input {
          font-size: 16px;
        }

        .modal-overlay { padding: 4vh 12px; }
      }

      @media (max-width: 460px) {
        .account-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
