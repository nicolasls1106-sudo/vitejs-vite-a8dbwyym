import { useState, useEffect } from "react";

// 🔗 Llamamos a la URL desde el archivo oculto .env de forma segura
// Si aún no tienes el .env, reemplaza import.meta.env.VITE_SHEETDB_URL por "TU_URL_AQUI"
const API_URL = import.meta.env.VITE_SHEETDB_URL || "URL_DE_EMERGENCIA";

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface RawFarmerRow {
  ID: string | number;
  Nombre: string;
  Cedula: string | number;
  Contrasena?: string | number; // 🔒 NUEVA COLUMNA PARA EL EXCEL
  Municipio?: string;
  Seniority_años?: string | number;
  Calidad_premium?: string;
  [key: string]: unknown;
}

interface RawMovRow {
  ID: string | number;
  ID_Agricultor: string | number;
  Descripcion?: string;
  Puntos: string | number;
  Tipo?: string;
  Fecha?: string;
  Nombre_Agricultor?: string;
  Registrado_por?: string;
  [key: string]: unknown;
}

interface RawPremioRow {
  ID: string | number;
  Emoji?: string;
  Nombre: string;
  Descripcion?: string;
  Puntos_requeridos: string | number;
  Stock: string | number;
  Activo?: string;
}

interface RawCanjeRow {
  ID: string | number;
  ID_Agricultor: string | number;
  Nombre_Agricultor: string;
  ID_Premio: string | number;
  Nombre_Premio: string;
  Puntos_canjeados: string | number;
  Fecha_solicitud: string;
  Estado: string;
  Fecha_entrega: string;
}

interface HistoryItem {
  id: string;
  desc: string;
  pts: number;
  type: "plus" | "minus" | "gold";
  date: string;
}

interface Farmer {
  id: string;
  name: string;
  cedula: string;
  municipio: string;
  points: number;
  seniority: number;
  quality: boolean;
  tons: number;
  history: HistoryItem[];
}

interface Premio {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  pts: number;
  stock: number;
}

interface LvlInfo {
  l: "diamond" | "gold" | "silver";
  lbl: string;
  bc: string;
  cc: string;
  next: string | null;
  np: number | null;
  prog: number;
}

interface DB {
  farmers: RawFarmerRow[];
  movimientos: RawMovRow[];
  premios: Premio[];
}

interface Session {
  type: "farmer" | "admin";
  data?: Farmer;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const lvl = (pts: number | string): LvlInfo => {
  const p = Number(pts) || 0;
  if (p >= 5000) return { l:"diamond", lbl:"Diamante 💎", bc:"lv-d", cc:"cd", next:null, np:null, prog:100 };
  if (p >= 1000) return { l:"gold", lbl:"Gold ⭐", bc:"lv-g", cc:"cg", next:"Diamante 💎", np:5000, prog:((p-1000)/4000)*100 };
  return { l:"silver", lbl:"Silver 🌾", bc:"lv-s", cc:"cs", next:"Gold ⭐", np:1000, prog:(p/1000)*100 };
};

const disc: Record<string, string> = { silver:"5%", gold:"10%", diamond:"15%" };
const prc: Record<string, string>  = { silver:"Precio base", gold:"+2%/ton", diamond:"+4%/ton" };
const hoy = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const toNum = (v: unknown): number => {
  const n = Number(String(v).trim());
  return isNaN(n) ? 0 : n;
};

const sameId = (a: unknown, b: unknown): boolean =>
  Math.round(toNum(a)) === Math.round(toNum(b));

  const mapFarmer = (row: RawFarmerRow, movimientos: RawMovRow[]): Farmer => {
    const farmerId = row.ID;
    const misMov = movimientos.filter(m => sameId(m.ID_Agricultor, farmerId));
    
    // 1. Calculamos los puntos evitando negativos
    const rawPoints = misMov.reduce((sum, m) => sum + toNum(m.Puntos), 0);
    const points = Math.max(0, rawPoints);
  
    // 2. Calculamos las toneladas
    const toneladas = misMov
      .filter(m => m.Tipo === "suma" && !String(m.Descripcion).toLowerCase().includes("bono") && !String(m.Descripcion).toLowerCase().includes("antigüedad"))
      .reduce((sum, m) => sum + Math.max(0, toNum(m.Puntos)), 0);
  
    // 🌟 NUEVO: Traductor de fechas (convierte "06 mar 2026" a un valor de tiempo matemático)
    const parseDate = (dateStr: string) => {
      if (!dateStr) return 0;
      const str = String(dateStr).toLowerCase().replace('.', '');
      const parts = str.split(' ');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = {ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11}[parts[1].substring(0,3)] ?? 0;
        const y = parseInt(parts[2], 10);
        return new Date(y, m, d).getTime();
      }
      return new Date(str).getTime() || 0;
    };
  
    // 3. Ordenamos el historial usando el calendario real (b - a = más reciente a más antiguo)
    const historia: HistoryItem[] = [...misMov]
      .sort((a, b) => parseDate(String(b.Fecha)) - parseDate(String(a.Fecha)))
      .map((m, i) => {
        const pts = toNum(m.Puntos);
        const tipo = String(m.Tipo || "").toLowerCase();
        let type: "plus" | "minus" | "gold" = "plus";
        if (tipo === "descuento") type = "minus";
        else if (tipo === "canje") type = "gold";
        else if (pts < 0) type = "minus";
        return { id: String(m.ID ?? i), desc: m.Descripcion || "—", pts, type, date: m.Fecha || "" };
      });
  
    return {
      id:        String(farmerId),
      name:      row.Nombre || "—",
      cedula:    String(row.Cedula || "").trim(),
      municipio: row.Municipio || "—",
      points,
      seniority: toNum(row["Seniority_años"] ?? 0),
      quality:   String(row.Calidad_premium || "").toUpperCase() === "SI",
      tons:      toneladas,
      history:   historia,
    };
  };

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const style = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  :root { --cream:#f5f0e8;--brown:#3d2b1f;--bl:#7a5c45;--green:#2d5a27;--gl:#4a8c42;--gold:#c8922a;--gll:#e8b84b;--silver:#8a9ba8;--diam:#4fc3c0;--red:#c0392b;--white:#fffdf8; }
  .app { min-height:100vh; background:var(--cream); font-family:'DM Sans',sans-serif; }
  .login-screen { min-height:100vh; display:flex; items-align:center; justify-content:center; background:linear-gradient(160deg,#1a3a15,#2d5a27,#3d2b1f); align-items:center; }
  .login-card { background:var(--white); border-radius:24px; padding:48px 40px; width:400px; max-width:95vw; box-shadow:0 40px 80px rgba(0,0,0,.4); }
  .brand { font-family:'Playfair Display',serif; font-size:36px; font-weight:900; color:var(--green); text-align:center; margin-bottom:4px; }
  .brand span { color:var(--gold); }
  .brand-sub { font-size:11px; color:var(--bl); text-transform:uppercase; letter-spacing:3px; text-align:center; margin-bottom:28px; }
  .tabs { display:flex; background:var(--cream); border-radius:12px; padding:4px; margin-bottom:24px; }
  .tab { flex:1; padding:10px; border:none; background:transparent; border-radius:9px; cursor:pointer; font-size:13px; font-weight:500; color:var(--bl); font-family:'DM Sans',sans-serif; transition:all .2s; }
  .tab.active { background:var(--white); color:var(--green); font-weight:700; box-shadow:0 2px 8px rgba(0,0,0,.1); }
  .lbl { font-size:11px; font-weight:700; color:var(--bl); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .inp { width:100%; padding:12px 16px; border:1.5px solid #e0d8ce; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:15px; color:var(--brown); background:var(--white); margin-bottom:16px; outline:none; }
  .inp:focus { border-color:var(--green); }
  .btn { width:100%; padding:14px; background:var(--green); color:white; border:none; border-radius:12px; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:700; cursor:pointer; }
  .btn:hover { background:var(--gl); } .btn:disabled { opacity:.5; cursor:not-allowed; }
  .err { color:var(--red); font-size:12px; font-weight:600; margin-bottom:10px; }
  .fapp { max-width:420px; margin:0 auto; min-height:100vh; background:var(--cream); padding-bottom:80px; }
  .fhdr { background:linear-gradient(135deg,var(--green),#1a3a15); padding:20px 20px 60px; position:relative; overflow:hidden; }
  .fhdr::after { content:''; position:absolute; bottom:-30px; left:0; right:0; height:60px; background:var(--cream); border-radius:50% 50% 0 0/30px 30px 0 0; }
  .hdr-top { display:flex; justify-content:space-between; align-items:center; }
  .hbrand { font-family:'Playfair Display',serif; font-size:22px; font-weight:900; color:white; }
  .hbrand span { color:var(--gll); }
  .huser { display:flex; align-items:center; gap:8px; }
  .av { width:38px; height:38px; border-radius:50%; background:var(--gold); display:flex; align-items:center; justify-content:center; font-family:'Playfair Display',serif; font-size:16px; font-weight:700; color:white; }
  .hname { font-size:13px; color:rgba(255,255,255,.85); }
  .pcard { margin:0 20px; background:var(--white); border-radius:20px; padding:24px; box-shadow:0 8px 32px rgba(61,43,31,.12); position:relative; z-index:1; }
  .pcard-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
  .lvlbadge { display:inline-flex; align-items:center; padding:5px 12px; border-radius:20px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1px; }
  .lv-s { background:#eef2f5; color:var(--silver); } .lv-g { background:#fdf5e6; color:var(--gold); } .lv-d { background:#e6f9f9; color:var(--diam); }
  .pnum { font-family:'Playfair Display',serif; font-size:56px; font-weight:900; color:var(--brown); text-align:center; line-height:1; }
  .plbl { font-size:13px; color:var(--bl); text-align:center; margin-top:4px; margin-bottom:14px; }
  .pexp { background:#fdf5e6; border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; margin-bottom:14px; }
  .pexp-l { font-size:12px; color:var(--bl); font-weight:500; } .pexp-d { font-size:13px; font-weight:700; color:var(--gold); }
  .prog-lbl { display:flex; justify-content:space-between; font-size:12px; color:var(--bl); margin-bottom:6px; }
  .prog-bar { height:8px; background:#e8e0d6; border-radius:4px; overflow:hidden; }
  .prog-fill { height:100%; background:linear-gradient(90deg,var(--green),var(--gold)); border-radius:4px; }
  .prog-next { font-size:11px; color:var(--bl); margin-top:5px; text-align:right; }
  .qstats { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin:14px 20px 0; }
  .qsc { background:var(--white); border-radius:14px; padding:14px 10px; text-align:center; box-shadow:0 2px 12px rgba(61,43,31,.07); }
  .qsi { font-size:20px; margin-bottom:6px; } .qsv { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:var(--brown); } .qsn { font-size:10px; color:var(--bl); font-weight:500; margin-top:2px; }
  .sec { margin:18px 20px 0; }
  .sec-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
  .sec-ttl { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:var(--brown); }
  .sec-lnk { font-size:12px; font-weight:700; color:var(--green); cursor:pointer; background:none; border:none; }
  .bgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .bcard { background:var(--white); border-radius:14px; padding:16px; box-shadow:0 2px 12px rgba(61,43,31,.07); }
  .bi { font-size:24px; margin-bottom:8px; } .bt { font-size:13px; font-weight:700; color:var(--brown); margin-bottom:3px; } .bd { font-size:11px; color:var(--bl); line-height:1.4; }
  .btag { display:inline-block; margin-top:8px; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; background:#eef5ec; color:var(--green); }
  .pscroll { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none; }
  .pscroll::-webkit-scrollbar { display:none; }
  .pzcard { background:var(--white); border-radius:16px; padding:16px; min-width:148px; box-shadow:0 2px 12px rgba(61,43,31,.07); flex-shrink:0; cursor:pointer; transition:transform .15s; }
  .pzcard:hover { transform:translateY(-2px); } .pzcard.can { border:2px solid var(--green); }
  .pzem { font-size:32px; margin-bottom:8px; display:block; } .pzn { font-size:13px; font-weight:700; color:var(--brown); margin-bottom:4px; } .pzp { font-size:12px; font-weight:700; color:var(--gold); }
  .pzok { margin-top:7px; font-size:10px; font-weight:800; color:var(--green); text-transform:uppercase; } .pzno { font-size:10px; color:var(--bl); margin-top:7px; }
  .hlist { display:flex; flex-direction:column; gap:8px; }
  .hitem { background:var(--white); border-radius:14px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(61,43,31,.05); }
  .hleft { display:flex; gap:12px; align-items:center; }
  .hdot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .dg { background:var(--gl); } .dr { background:var(--red); } .dgld { background:var(--gold); }
  .hdesc { font-size:13px; font-weight:500; color:var(--brown); } .hdate { font-size:11px; color:var(--bl); margin-top:2px; }
  .hpts { font-size:14px; font-weight:700; } .hp { color:var(--green); } .hm { color:var(--red); }
  .bnav { position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:420px; max-width:100vw; background:var(--white); border-top:1px solid #e8e0d6; display:flex; padding:8px 0 14px; box-shadow:0 -4px 20px rgba(61,43,31,.08); z-index:50; }
  .nbtn { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; padding:8px 4px; border:none; background:transparent; cursor:pointer; }
  .ni { font-size:20px; } .nl { font-size:10px; font-weight:600; color:var(--bl); } .nbtn.act .nl { color:var(--green); }
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:20px; }
  .mcard { background:var(--white); border-radius:20px; padding:28px; width:100%; max-width:420px; box-shadow:0 24px 60px rgba(0,0,0,.3); }
  .mttl { font-family:'Playfair Display',serif; font-size:22px; font-weight:700; color:var(--brown); margin-bottom:16px; }
  .mact { display:flex; gap:10px; margin-top:18px; }
  .bsec { flex:1; padding:12px; background:var(--cream); color:var(--brown); border:1.5px solid #e0d8ce; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:600; cursor:pointer; }
  .bconf { flex:1; padding:12px; background:var(--green); color:white; border:none; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:700; cursor:pointer; }
  .toast { position:fixed; bottom:95px; left:50%; transform:translateX(-50%); background:var(--brown); color:white; padding:12px 24px; border-radius:100px; font-size:13px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,.3); z-index:200; white-space:nowrap; }
  .aapp { min-height:100vh; background:#f0ebe2; display:flex; }
  .aside { width:240px; background:var(--brown); padding:24px 16px; display:flex; flex-direction:column; min-height:100vh; flex-shrink:0; }
  .alo { font-family:'Playfair Display',serif; font-size:22px; font-weight:900; color:white; margin-bottom:4px; }
  .alo span { color:var(--gll); }
  .asub { font-size:10px; color:rgba(255,255,255,.4); text-transform:uppercase; letter-spacing:2px; margin-bottom:28px; }
  .anav { display:flex; flex-direction:column; gap:4px; flex:1; }
  .aitem { display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:500; color:rgba(255,255,255,.6); transition:all .15s; border:none; background:transparent; text-align:left; width:100%; font-family:'DM Sans',sans-serif; }
  .aitem:hover { background:rgba(255,255,255,.08); color:white; } .aitem.act { background:var(--green); color:white; font-weight:700; }
  .alout { margin-top:auto; padding-top:16px; border-top:1px solid rgba(255,255,255,.1); }
  .acont { flex:1; padding:32px; overflow-y:auto; max-height:100vh; }
  .apttl { font-family:'Playfair Display',serif; font-size:28px; font-weight:700; color:var(--brown); margin-bottom:4px; }
  .apsub { font-size:14px; color:var(--bl); margin-bottom:24px; }
  .astats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
  .astat { background:var(--white); border-radius:16px; padding:20px; box-shadow:0 2px 12px rgba(61,43,31,.07); }
  .asl { font-size:11px; font-weight:700; color:var(--bl); text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
  .asv { font-family:'Playfair Display',serif; font-size:32px; font-weight:700; color:var(--brown); }
  .ass { font-size:11px; color:var(--bl); margin-top:4px; }
  .atcard { background:var(--white); border-radius:16px; box-shadow:0 2px 12px rgba(61,43,31,.07); overflow:hidden; margin-bottom:20px; }
  .athdr { padding:18px 24px; border-bottom:1px solid #f0ebe2; display:flex; justify-content:space-between; align-items:center; }
  .atttl { font-size:16px; font-weight:700; color:var(--brown); }
  .bsm { padding:8px 16px; background:var(--green); color:white; border:none; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:700; cursor:pointer; }
  .bsm:hover { background:var(--gl); } .bsm.gld { background:var(--gold); } .bsm:disabled { opacity:.5; cursor:not-allowed; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; padding:11px 20px; font-size:11px; font-weight:700; color:var(--bl); text-transform:uppercase; background:#faf7f3; border-bottom:1px solid #f0ebe2; white-space:nowrap; }
  td { padding:13px 20px; font-size:13px; color:var(--brown); border-bottom:1px solid #f9f6f2; }
  tr:last-child td { border-bottom:none; } tr:hover td { background:#faf7f3; }
  .chip { display:inline-flex; align-items:center; padding:3px 10px; border-radius:100px; font-size:11px; font-weight:700; }
  .cs { background:#eef2f5; color:var(--silver); } .cg { background:#fdf5e6; color:var(--gold); } .cd { background:#e6f9f9; color:var(--diam); }
  .pgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:16px; }
  .pzac { background:var(--white); border-radius:14px; padding:20px; box-shadow:0 2px 12px rgba(61,43,31,.07); text-align:center; }
  .pzan { font-size:14px; font-weight:700; color:var(--brown); margin-bottom:4px; }
  .pzap { font-size:13px; font-weight:700; color:var(--gold); margin-bottom:4px; }
  .pzas { font-size:12px; color:var(--bl); margin-bottom:12px; }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; margin-right:8px; vertical-align:middle; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:768px){ .aapp{flex-direction:column;} .aside{width:100%;min-height:auto;padding:12px;} .anav{flex-direction:row;flex-wrap:wrap;gap:4px;} .aitem{padding:8px 10px;font-size:11px;} .astats{grid-template-columns:1fr 1fr;} .acont{padding:16px;} .alo,.asub,.alout{display:none;} }
`;

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

// ─── FARMER APP ───────────────────────────────────────────────────────────────
interface FarmerAppProps { farmer: Farmer; premios: Premio[]; onLogout: () => void; }

function FarmerApp({ farmer, premios, onLogout }: FarmerAppProps) {
  const [tab, setTab]     = useState<string>("home");
  const [toast, setToast] = useState<string | null>(null);
  const [rdm, setRdm]     = useState<Premio | null>(null);
  const [f, setF]         = useState<Farmer>(farmer);
  const li = lvl(f.points);
  const t  = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const confirmRedeem = async () => {
    if (!rdm || f.points < rdm.pts) return;
    try {
      await fetch(`${API_URL}?sheet=Canjes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [{ ID: Date.now(), ID_Agricultor: f.id, Nombre_Agricultor: f.name, ID_Premio: rdm.id, Nombre_Premio: rdm.name, Puntos_canjeados: rdm.pts, Fecha_solicitud: hoy(), Estado: "Pendiente", Fecha_entrega: "" }] }),
      });
      await fetch(`${API_URL}?sheet=Movimientos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [{ ID: Date.now()+1, ID_Agricultor: f.id, Nombre_Agricultor: f.name, Descripcion: `Canje: ${rdm.name}`, Puntos: -rdm.pts, Tipo: "canje", Fecha: hoy(), Registrado_por: "Sistema" }] }),
      });
    } catch(e) { console.warn("Error guardando canje:", e); }
    setF(x => ({ ...x, points: x.points - rdm.pts, history: [{ id: String(Date.now()), desc:`Canje: ${rdm.name}`, pts:-rdm.pts, type:"gold" as const, date:hoy() }, ...x.history] }));
    t(`✅ ¡${rdm.name} canjeado!`); setRdm(null);
  };

  return (
    <div className="fapp">
      <div className="fhdr">
        <div className="hdr-top">
          <div className="hbrand">Vive<span>Puntos</span></div>
          <div className="huser"><div className="av">{f.name[0]}</div><div className="hname">{f.name.split(" ")[0]}</div></div>
        </div>
      </div>

      {tab === "home" && <>
        <div className="pcard">
          <div className="pcard-top">
            <div><div style={{fontSize:11,color:"var(--bl)",fontWeight:700,marginBottom:4}}>TU NIVEL</div><span className={`lvlbadge ${li.bc}`}>{li.lbl}</span></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:11,color:"var(--bl)"}}>Municipio</div><div style={{fontSize:13,fontWeight:700,color:"var(--brown)"}}>{f.municipio}</div></div>
          </div>
          <div className="pnum">{f.points.toLocaleString()}</div>
          <div className="plbl">puntos disponibles</div>
          <div className="pexp"><span className="pexp-l">⏰ Vencen el</span><span className="pexp-d">31 Dic 2025</span></div>
          {li.next && li.np && <>
            <div className="prog-lbl"><span>Hacia {li.next}</span><span>{f.points.toLocaleString()} / {li.np.toLocaleString()}</span></div>
            <div className="prog-bar"><div className="prog-fill" style={{width:`${Math.min(100,li.prog)}%`}}/></div>
            <div className="prog-next">Faltan {(li.np - f.points).toLocaleString()} pts</div>
          </>}
        </div>
        <div className="qstats">
          {[
            { i:"📅", v:`${f.seniority} año(s)`, n:"Antigüedad" },
            { i:"🌾", v:`${f.history.filter(h=>h.type==="plus").length} mov.`, n:"Entregas" },
            { i:"🎁", v:premios.filter(p=>f.points>=p.pts).length, n:"Canjeables" },
          ].map((s,i) => (
            <div key={i} className="qsc"><div className="qsi">{s.i}</div><div className="qsv">{s.v}</div><div className="qsn">{s.n}</div></div>
          ))}
        </div>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-ttl">Tus beneficios</div></div>
          <div className="bgrid">
            <div className="bcard"><div className="bi">🌿</div><div className="bt">Descuento insumos</div><div className="bd">Fertilizantes y agroquímicos aliados</div><span className="btag">{disc[li.l]} OFF</span></div>
            <div className="bcard"><div className="bi">💰</div><div className="bt">Mejor precio</div><div className="bd">Prima por tonelada entregada</div><span className="btag">{prc[li.l]}</span></div>
            <div className="bcard"><div className="bi">🎁</div><div className="bt">Canje premios</div><div className="bd">Herramientas agrícolas</div><span className="btag">Catálogo activo</span></div>
            <div className="bcard"><div className="bi">📞</div><div className="bt">Soporte</div><div className="bd">Atención preferencial</div><span className="btag">{li.l==="diamond"?"Prioritario":"Estándar"}</span></div>
          </div>
        </div>
        <div className="sec" style={{marginBottom:20}}>
          <div className="sec-hdr"><div className="sec-ttl">Premios</div><button className="sec-lnk" onClick={()=>setTab("prizes")}>Ver todos →</button></div>
          <div className="pscroll">
            {premios.map(p => { const can = f.points >= p.pts; return (
              <div key={p.id} className={`pzcard ${can?"can":""}`} onClick={()=>can&&setRdm(p)}>
                <span className="pzem">{p.emoji}</span><div className="pzn">{p.name}</div><div className="pzp">{p.pts} pts</div>
                {can ? <div className="pzok">✓ Canjear</div> : <div className="pzno">Faltan {p.pts-f.points} pts</div>}
              </div>
            );})}
          </div>
        </div>
      </>}

      {tab === "prizes" && <div style={{padding:"20px 20px 0"}}>
        <div className="sec-ttl" style={{marginBottom:16,marginTop:8}}>Catálogo de Premios</div>
        {premios.map(p => { const can = f.points >= p.pts; return (
          <div key={p.id} style={{background:"var(--white)",borderRadius:14,padding:"16px 20px",display:"flex",alignItems:"center",gap:16,boxShadow:"0 2px 8px rgba(61,43,31,.06)",marginBottom:10,cursor:can?"pointer":"default"}} onClick={()=>can&&setRdm(p)}>
            <div style={{fontSize:28,flexShrink:0}}>{p.emoji}</div>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:"var(--brown)"}}>{p.name}</div><div style={{fontSize:13,fontWeight:700,color:"var(--gold)"}}>{p.pts} puntos</div><div style={{fontSize:11,color:"var(--bl)",marginTop:2}}>Stock: {p.stock} unidades</div></div>
            {can ? <div style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,background:"#eef5ec",color:"var(--green)",flexShrink:0}}>✓ Canjear</div>
                 : <div style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,background:"#fdf5e6",color:"var(--gold)",flexShrink:0}}>-{p.pts-f.points} pts</div>}
          </div>
        );})}
      </div>}

      {tab === "history" && <div style={{padding:"20px 20px 0"}}>
        <div className="sec-ttl" style={{marginBottom:16,marginTop:8}}>Historial de puntos</div>
        {f.history.length === 0
          ? <div style={{background:"var(--white)",borderRadius:14,padding:32,textAlign:"center",color:"var(--bl)",fontSize:14}}>Sin movimientos registrados</div>
          : <div className="hlist">
              {f.history.map(h => (
                <div key={h.id} className="hitem">
                  <div className="hleft">
                    <div className={`hdot ${h.type==="plus"?"dg":h.type==="minus"?"dr":"dgld"}`}/>
                    <div><div className="hdesc">{h.desc}</div><div className="hdate">{h.date}</div></div>
                  </div>
                  <div className={`hpts ${h.type==="plus"?"hp":"hm"}`}>{h.type==="plus"?"+":""}{h.pts}</div>
                </div>
              ))}
            </div>
        }
      </div>}

      {tab === "account" && <div style={{padding:"20px 20px 0"}}>
        <div className="sec-ttl" style={{marginBottom:20,marginTop:8}}>Mi cuenta</div>
        <div style={{background:"var(--white)",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(61,43,31,.07)",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
            <div className="av" style={{width:52,height:52,fontSize:22}}>{f.name[0]}</div>
            <div><div style={{fontFamily:"Playfair Display,serif",fontSize:20,fontWeight:700,color:"var(--brown)"}}>{f.name}</div><div style={{fontSize:13,color:"var(--bl)"}}>C.C. {f.cedula}</div></div>
          </div>
          {([["📍 Municipio",f.municipio],["📅 Antigüedad",`${f.seniority} año(s)`],["💎 Nivel",li.lbl],["🎯 Puntos",f.points.toLocaleString()],["📋 Movimientos",`${f.history.length} registros`],["⏰ Vencimiento","31 Dic 2025"]] as [string,string][]).map(([k,v]) => (
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f0ebe2",fontSize:14}}>
              <span style={{color:"var(--bl)"}}>{k}</span><span style={{fontWeight:700,color:"var(--brown)"}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{background:"#fdf5e6",borderRadius:14,padding:16,marginBottom:14}}>
          <div style={{fontWeight:700,color:"var(--gold)",marginBottom:6,fontSize:14}}>⚠️ Reglas de puntos</div>
          <div style={{fontSize:12,color:"var(--bl)",lineHeight:1.7}}>• 1 pt base por tonelada entregada<br/>• Calidad premium: <strong>+25% extra</strong><br/>• Cumplir 100% pactado: <strong>+10% bono</strong><br/>• Por año de antigüedad: <strong>+50 pts</strong><br/>• Por cada 5% faltante: <strong>-50 pts</strong></div>
        </div>
        <button className="btn" style={{background:"var(--brown)"}} onClick={onLogout}>Cerrar sesión</button>
      </div>}

      <div className="bnav">
        {([{id:"home",i:"🏠",l:"Inicio"},{id:"prizes",i:"🎁",l:"Premios"},{id:"history",i:"📋",l:"Historial"},{id:"account",i:"👤",l:"Mi cuenta"}] as {id:string;i:string;l:string}[]).map(n => (
          <button key={n.id} className={`nbtn ${tab===n.id?"act":""}`} onClick={()=>setTab(n.id)}>
            <span className="ni">{n.i}</span><span className="nl">{n.l}</span>
          </button>
        ))}
      </div>

      {rdm && <div className="overlay" onClick={()=>setRdm(null)}>
        <div className="mcard" onClick={e=>e.stopPropagation()}>
          <div style={{textAlign:"center",fontSize:52,marginBottom:12}}>{rdm.emoji}</div>
          <div className="mttl">Canjear {rdm.name}</div>
          <div style={{background:"#fdf5e6",borderRadius:10,padding:14,fontSize:13,lineHeight:1.8}}>
            <div>Puntos actuales: <strong>{f.points.toLocaleString()}</strong></div>
            <div>Costo: <strong>-{rdm.pts} pts</strong></div>
            <div style={{color:"var(--green)",fontWeight:700}}>Quedarán: {(f.points-rdm.pts).toLocaleString()} pts</div>
          </div>
          <div className="mact"><button className="bsec" onClick={()=>setRdm(null)}>Cancelar</button><button className="bconf" onClick={confirmRedeem}>✅ Confirmar</button></div>
        </div>
      </div>}
      <Toast msg={toast}/>
    </div>
  );
}

// ─── ADMIN APP ────────────────────────────────────────────────────────────────
interface AdminAppProps {
  farmersRaw: RawFarmerRow[];
  movimientosRaw: RawMovRow[];
  premios: Premio[];
  rawDebug: DB;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}

function AdminApp({ farmersRaw, movimientosRaw, premios, rawDebug, onRefresh, onLogout }: AdminAppProps) {
  const [sec, setSec]       = useState<string>("dash");
  const [toast, setToast]   = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [form, setForm]     = useState({ fid:"", amt:"", reason:"", type:"plus" });
  const t = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const farmers = farmersRaw.map(r => mapFarmer(r, movimientosRaw));
  const tot = { n:farmers.length, pts:farmers.reduce((a,f)=>a+f.points,0), dia:farmers.filter(f=>lvl(f.points).l==="diamond").length, gld:farmers.filter(f=>lvl(f.points).l==="gold").length };
  const todayStr = hoy();
  const movHoy = movimientosRaw.filter(m => m.Fecha === todayStr);

  const apply = async () => {
    const farmer = farmers.find(f => f.id === form.fid);
    if (!farmer || !form.amt) return;
    setSaving(true);
    const delta = parseInt(form.amt) * (form.type === "minus" ? -1 : 1);
    
    // ⛔ VALIDACIÓN: Bloquear saldo negativo
    if (farmer.points + delta < 0) {
      setSaving(false);
      t(`❌ Error: El agricultor no puede quedar con puntos negativos (tiene ${farmer.points})`);
      return;
    }

    // 🌟 EL TRUCO AQUÍ: Buscamos el ID más alto que existe en tu Excel y le sumamos 1
    const maxId = movimientosRaw.reduce((max, m) => Math.max(max, Number(m.ID) || 0), 0);
    const nuevoId = maxId + 1;

    // Guardamos usando el nuevo ID secuencial
    const nuevoMov = { 
      ID: nuevoId, 
      ID_Agricultor: Number(farmer.id), 
      Nombre_Agricultor: farmer.name, 
      Descripcion: form.reason || "Ajuste manual admin", 
      Puntos: delta, 
      Tipo: form.type === "plus" ? "suma" : "descuento", 
      Fecha: todayStr, 
      Registrado_por: "Admin" 
    };

    try {
      const res = await fetch(`${API_URL}?sheet=Movimientos`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({data:[nuevoMov]}) });
      if (!res.ok) throw new Error("SheetDB respondió con error");
      await onRefresh();
      t(`✅ ${delta>0?"+":""}${delta} pts para ${farmer.name}`);
      setForm({ fid:"", amt:"", reason:"", type:"plus" });
    } catch(e) { t(`❌ Error: ${(e as Error).message}`); } finally { setSaving(false); }
  };

  return (
    <div className="aapp">
      <div className="aside">
        <div className="alo">Vive<span>Puntos</span></div>
        <div className="asub">Panel Admin</div>
        <div className="anav">
          {([{id:"dash",i:"📊",l:"Dashboard"},{id:"farmers",i:"👨‍🌾",l:"Agricultores"},{id:"pts",i:"⭐",l:"Asignar Puntos"},{id:"canjes",i:"🔄",l:"Canjes"},{id:"prz",i:"🎁",l:"Premios"},{id:"debug",i:"🔍",l:"Debug datos"}] as {id:string;i:string;l:string}[]).map(s => (
            <button key={s.id} className={`aitem ${sec===s.id?"act":""}`} onClick={()=>setSec(s.id)}><span>{s.i}</span> {s.l}</button>
          ))}
        </div>
        <div className="alout"><button className="aitem" onClick={onLogout}>🚪 Cerrar sesión</button></div>
      </div>
      <div className="acont">

        {sec === "dash" && <>
          <div className="apttl">Dashboard</div>
          <div className="apsub">Puntos calculados en tiempo real desde Movimientos</div>
          <div className="astats">
            {[{l:"Agricultores",v:tot.n,s:"Registrados"},{l:"Puntos activos",v:tot.pts.toLocaleString(),s:"Suma total"},{l:"Diamante 💎",v:tot.dia,s:"5.000+ pts"},{l:"Gold ⭐",v:tot.gld,s:"1.000+ pts"}].map((s,i) => (
              <div key={i} className="astat"><div className="asl">{s.l}</div><div className="asv">{s.v}</div><div className="ass">{s.s}</div></div>
            ))}
          </div>
          <div className="atcard">
            <div className="athdr"><div className="atttl">Todos los agricultores</div><button className="bsm" onClick={onRefresh}>🔄 Actualizar</button></div>
            <table><thead><tr><th>Nombre</th><th>Nivel</th><th>Puntos</th><th>Municipio</th><th>Antigüedad</th><th>Movimientos</th></tr></thead>
            <tbody>{farmers.map(f => { const li=lvl(f.points); return (
              <tr key={f.id}><td><strong>{f.name}</strong></td><td><span className={`chip ${li.cc}`}>{li.lbl}</span></td><td><strong>{f.points.toLocaleString()}</strong></td><td>{f.municipio}</td><td>{f.seniority} año(s)</td><td style={{color:"var(--bl)"}}>{f.history.length} registros</td></tr>
            );})}</tbody></table>
          </div>
        </>}

        {sec === "farmers" && <>
          <div className="apttl">Agricultores</div>
          <div className="apsub">Con historial detallado por agricultor</div>
          {farmers.map(f => { const li=lvl(f.points); return (
            <div key={f.id} className="atcard">
              <div className="athdr">
                <div><div className="atttl">{f.name}</div><div style={{fontSize:12,color:"var(--bl)",marginTop:2}}>C.C. {f.cedula} · {f.municipio} · {f.seniority} año(s)</div></div>
                <span className={`chip ${li.cc}`}>{f.points.toLocaleString()} pts · {li.lbl}</span>
              </div>
              {f.history.length === 0
                ? <div style={{padding:"16px 20px",color:"var(--bl)",fontSize:13}}>Sin movimientos</div>
                : <table><thead><tr><th>Descripción</th><th>Puntos</th><th>Tipo</th><th>Fecha</th></tr></thead>
                  <tbody>{f.history.map(h => (
                    <tr key={h.id}><td>{h.desc}</td><td style={{fontWeight:700,color:h.pts<0?"var(--red)":"var(--green)"}}>{h.pts>0?"+":""}{h.pts}</td><td style={{color:"var(--bl)",textTransform:"capitalize"}}>{h.type==="plus"?"suma":h.type==="minus"?"descuento":"canje"}</td><td style={{color:"var(--bl)"}}>{h.date}</td></tr>
                  ))}</tbody></table>
              }
            </div>
          );})}
        </>}

        {sec === "pts" && <>
          <div className="apttl">Asignar Puntos</div>
          <div className="apsub">Se guarda directo en la hoja Movimientos del Excel</div>
          <div style={{background:"var(--white)",borderRadius:16,padding:28,boxShadow:"0 2px 12px rgba(61,43,31,.07)",maxWidth:500,marginBottom:24}}>
            <div className="lbl">Agricultor</div>
            <select className="inp" style={{appearance:"none"}} value={form.fid} onChange={e=>setForm(f=>({...f,fid:e.target.value}))}>
              <option value="">Selecciona un agricultor...</option>
              {farmers.map(f => <option key={f.id} value={f.id}>{f.name} — {lvl(f.points).lbl} ({f.points.toLocaleString()} pts)</option>)}
            </select>
            <div className="lbl">Tipo de ajuste</div>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {([{v:"plus",l:"➕ Sumar"},{v:"minus",l:"➖ Descontar"}] as {v:string;l:string}[]).map(o => (
                <button key={o.v} onClick={()=>setForm(f=>({...f,type:o.v}))} style={{flex:1,padding:10,borderRadius:10,border:`2px solid ${form.type===o.v?(o.v==="plus"?"var(--green)":"var(--red)"):"#e0d8ce"}`,background:form.type===o.v?(o.v==="plus"?"#eef5ec":"#fdeaea"):"white",cursor:"pointer",fontFamily:"DM Sans,sans-serif",fontSize:13,fontWeight:700,color:form.type===o.v?(o.v==="plus"?"var(--green)":"var(--red)"):"var(--bl)"}}>
                  {o.l}
                </button>
              ))}
            </div>
            <div className="lbl">Cantidad de puntos</div>
            <input className="inp" type="number" min="1" placeholder="Ej: 50" value={form.amt} onChange={e=>setForm(f=>({...f,amt:e.target.value}))}/>
            <div className="lbl">Motivo</div>
            <input className="inp" type="text" placeholder="Ej: Entrega 50t calidad premium" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/>
            <button className="btn" onClick={apply} disabled={!form.fid||!form.amt||saving}>
              {saving ? <><span className="spinner"/>Guardando...</> : "💾 Guardar en Excel"}
            </button>
          </div>
          <div className="atcard">
            <div className="athdr"><div className="atttl">Movimientos de hoy ({movHoy.length})</div><button className="bsm" onClick={onRefresh}>🔄</button></div>
            <table><thead><tr><th>Agricultor</th><th>Descripción</th><th>Puntos</th><th>Tipo</th></tr></thead>
            <tbody>{movHoy.length === 0
              ? <tr><td colSpan={4} style={{textAlign:"center",color:"var(--bl)",padding:24}}>No hay movimientos hoy</td></tr>
              : movHoy.map((m,i) => (
                <tr key={i}><td><strong>{m.Nombre_Agricultor}</strong></td><td>{m.Descripcion}</td><td style={{fontWeight:700,color:toNum(m.Puntos)<0?"var(--red)":"var(--green)"}}>{toNum(m.Puntos)>0?"+":""}{m.Puntos}</td><td style={{color:"var(--bl)"}}>{m.Tipo}</td></tr>
              ))
            }</tbody></table>
          </div>
        </>}

        {sec === "canjes" && <CanjeSec t={t}/>}

        {sec === "prz" && <>
          <div className="apttl">Catálogo de Premios</div>
          <div className="apsub">Cargados desde la hoja Premios del Excel</div>
          <div className="pgrid">
            {premios.map(p => (
              <div key={p.id} className="pzac">
                <div style={{fontSize:36,marginBottom:10}}>{p.emoji}</div>
                <div className="pzan">{p.name}</div>
                <div className="pzap">{p.pts} puntos</div>
                <div className="pzas">Stock: {p.stock} unidades</div>
                <button className="bsm" style={{width:"100%"}} onClick={()=>t("Edita el stock en Google Sheets 📊")}>ℹ️ Editar en Excel</button>
              </div>
            ))}
          </div>
        </>}

        {sec === "debug" && <>
          <div className="apttl">Debug — Datos de SheetDB</div>
          <div className="apsub">Verifica exactamente qué está devolviendo SheetDB</div>
          <div className="atcard">
            <div className="athdr"><div className="atttl">📋 Primera fila de Agricultores (raw)</div></div>
            <div style={{padding:16,overflowX:"auto"}}>
              <pre style={{fontSize:11,color:"var(--brown)",lineHeight:1.7}}>{JSON.stringify(rawDebug.farmers[0]||"Sin datos",null,2)}</pre>
            </div>
          </div>
          <div className="atcard">
            <div className="athdr"><div className="atttl">📊 Primeras 3 filas de Movimientos (raw)</div></div>
            <div style={{padding:16,overflowX:"auto"}}>
              <pre style={{fontSize:11,color:"var(--brown)",lineHeight:1.7}}>{JSON.stringify(rawDebug.movimientos.slice(0,3),null,2)}</pre>
            </div>
          </div>
          <div className="atcard">
            <div className="athdr"><div className="atttl">🧮 Agricultores procesados</div></div>
            <table><thead><tr><th>ID</th><th>Nombre</th><th>Cédula</th><th>Puntos</th><th>Historial</th></tr></thead>
            <tbody>{farmers.map(f => (
              <tr key={f.id}><td>{f.id}</td><td>{f.name}</td><td>{f.cedula}</td><td style={{fontWeight:700,color:"var(--green)"}}>{f.points}</td><td>{f.history.length} movimientos</td></tr>
            ))}</tbody></table>
          </div>
        </>}

      </div>
      <Toast msg={toast}/>
    </div>
  );
}

// ─── CANJES ───────────────────────────────────────────────────────────────────
function CanjeSec({ t }: { t: (m: string) => void }) {
  const [canjes, setCanjes]   = useState<RawCanjeRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const cargar = () => {
    setLoading(true);
    fetch(`${API_URL}?sheet=Canjes`).then(r=>r.json()).then((d: RawCanjeRow[])=>{setCanjes(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));
  };
  useEffect(() => { cargar(); }, []);

  const marcarEntregado = async (c: RawCanjeRow) => {
    try {
      await fetch(`${API_URL}/ID/${c.ID}?sheet=Canjes`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({data:{Estado:"Entregado",Fecha_entrega:new Date().toLocaleDateString("es-CO")}}) });
      setCanjes(x=>x.map(i=>String(i.ID)===String(c.ID)?{...i,Estado:"Entregado"}:i));
      t("✅ Marcado como entregado");
    } catch(e) { t("❌ Error al actualizar"); }
  };

  const pendientes = canjes.filter(c=>c.Estado==="Pendiente");
  const entregados = canjes.filter(c=>c.Estado==="Entregado");
  if (loading) return <div style={{padding:32,color:"var(--bl)"}}>⏳ Cargando canjes...</div>;

  return <>
    <div className="apttl">Gestión de Canjes</div>
    <div className="apsub">{pendientes.length} pendiente(s) · {entregados.length} entregado(s)</div>
    {pendientes.length === 0
      ? <div style={{background:"var(--white)",borderRadius:14,padding:24,textAlign:"center",color:"var(--bl)",marginBottom:20}}>✅ No hay canjes pendientes</div>
      : <div className="atcard"><div className="athdr"><div className="atttl">⏳ Pendientes</div><button className="bsm" onClick={cargar}>🔄</button></div>
          <table><thead><tr><th>Agricultor</th><th>Premio</th><th>Puntos</th><th>Fecha</th><th>Acción</th></tr></thead>
          <tbody>{pendientes.map((c,i)=>(<tr key={i}><td><strong>{c.Nombre_Agricultor}</strong></td><td>{c.Nombre_Premio}</td><td style={{fontWeight:700,color:"var(--gold)"}}>{c.Puntos_canjeados}</td><td style={{color:"var(--bl)"}}>{c.Fecha_solicitud}</td><td><button className="bsm" onClick={()=>marcarEntregado(c)}>✅ Entregar</button></td></tr>))}</tbody>
        </table></div>
    }
    {entregados.length > 0 && <div className="atcard"><div className="athdr"><div className="atttl">✅ Historial</div></div>
      <table><thead><tr><th>Agricultor</th><th>Premio</th><th>Puntos</th><th>Entregado</th></tr></thead>
      <tbody>{entregados.map((c,i)=>(<tr key={i}><td>{c.Nombre_Agricultor}</td><td>{c.Nombre_Premio}</td><td style={{fontWeight:700,color:"var(--gold)"}}>{c.Puntos_canjeados}</td><td style={{color:"var(--green)"}}>{c.Fecha_entrega}</td></tr>))}</tbody>
    </table></div>}
  </>;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
interface LoginProps {
  farmersRaw: RawFarmerRow[];
  movimientosRaw: RawMovRow[];
  onLogin: (s: Session) => void;
}

function Login({ farmersRaw, movimientosRaw, onLogin }: LoginProps) {
  const [mode, setMode]             = useState<"farmer"|"admin">("farmer");
  const [cedula, setCedula]         = useState<string>("");
  const [farmerPass, setFarmerPass] = useState<string>(""); // 🔒 Estado para la clave del agricultor
  const [user, setUser]             = useState<string>("");
  const [pass, setPass]             = useState<string>("");
  const [err, setErr]               = useState<string>("");

  const go = () => {
    setErr("");
    if (mode === "farmer") {
      // 1. Buscamos la cédula
      const row = farmersRaw.find(x => String(x.Cedula).trim() === cedula.trim());
      if (!row) return setErr(`Cédula no encontrada.`);
      
      // 2. Validamos la contraseña del Excel
      if (String(row.Contrasena).trim() !== farmerPass.trim()) {
        return setErr("Contraseña incorrecta. Intenta de nuevo.");
      }

      onLogin({ type:"farmer", data: mapFarmer(row, movimientosRaw) });
    } else {
      if (user === "admin" && pass === "viveagro") onLogin({ type:"admin" });
      else setErr("Usuario o contraseña incorrectos.");
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">Vive<span>Puntos</span></div>
        <div className="brand-sub">Programa de fidelización agrícola</div>
        <div className="tabs">
          <button className={`tab ${mode==="farmer"?"active":""}`} onClick={()=>setMode("farmer")}>👨‍🌾 Soy agricultor</button>
          <button className={`tab ${mode==="admin"?"active":""}`} onClick={()=>setMode("admin")}>🛠️ Admin ViveAgro</button>
        </div>
        {mode === "farmer"
          ? <>
              <div className="lbl">Número de cédula</div>
              <input className="inp" placeholder="Ej: 12345678" value={cedula} onChange={e=>setCedula(e.target.value)}/>
              <div className="lbl">Contraseña</div>
              <input className="inp" type="password" placeholder="Tu contraseña secreta" value={farmerPass} onChange={e=>setFarmerPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
            </>
          : <>
              <div className="lbl">Usuario</div>
              <input className="inp" placeholder="admin" value={user} onChange={e=>setUser(e.target.value)}/>
              <div className="lbl">Contraseña</div>
              <input className="inp" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
            </>
        }
        {err && <div className="err">⚠️ {err}</div>}
        <button className="btn" onClick={go}>Ingresar</button>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [db, setDb]           = useState<DB>({ farmers:[], movimientos:[], premios:[] });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError]     = useState<string | null>(null);

  const mapPremios = (rows: RawPremioRow[]): Premio[] =>
    (Array.isArray(rows) ? rows : [])
      .filter(r => String(r.Activo||"").toUpperCase() === "SI")
      .map(r => ({ id:String(r.ID), emoji:r.Emoji||"🎁", name:r.Nombre, desc:r.Descripcion||"", pts:toNum(r.Puntos_requeridos), stock:toNum(r.Stock) }));

  const cargarDatos = async () => {
    try {
      const [rF, rM, rP] = await Promise.all([
        fetch(`${API_URL}?sheet=Agricultores`),
        fetch(`${API_URL}?sheet=Movimientos`),
        fetch(`${API_URL}?sheet=Premios`),
      ]);
      if (!rF.ok || !rM.ok || !rP.ok) throw new Error("Error HTTP al conectar con SheetDB");
      const [farmers, movimientos, premiosRaw] = await Promise.all([rF.json(), rM.json(), rP.json()]) as [RawFarmerRow[], RawMovRow[], RawPremioRow[]];
      setDb({ farmers: Array.isArray(farmers)?farmers:[], movimientos: Array.isArray(movimientos)?movimientos:[], premios: mapPremios(premiosRaw) });
      setError(null);
      setLoading(false);
    } catch(e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  useEffect(() => { cargarDatos(); }, []);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f5f0e8",flexDirection:"column",gap:16}}>
      <div style={{fontFamily:"Playfair Display,serif",fontSize:32,fontWeight:900,color:"#2d5a27"}}>Vive<span style={{color:"#c8922a"}}>Puntos</span></div>
      <div style={{fontSize:14,color:"#7a5c45",fontWeight:500}}>⏳ Conectando con la base de datos...</div>
    </div>
  );

  if (error) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#f5f0e8",flexDirection:"column",gap:16,padding:32}}>
      <div style={{fontSize:40}}>❌</div>
      <div style={{fontFamily:"Playfair Display,serif",fontSize:22,fontWeight:700,color:"#3d2b1f",textAlign:"center"}}>Error al conectar</div>
      <div style={{fontSize:13,color:"#7a5c45",textAlign:"center",maxWidth:320,lineHeight:1.6}}>
        Verifica tu URL de SheetDB o el archivo .env<br/><br/>
        <strong>Error:</strong> {error}
      </div>
      <button onClick={()=>{setLoading(true);setError(null);cargarDatos();}} style={{padding:"12px 24px",background:"#2d5a27",color:"white",border:"none",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:14}}>🔄 Reintentar</button>
    </div>
  );

  return (
    <div className="app">
      <style>{style}</style>
      {!session
        ? <Login farmersRaw={db.farmers} movimientosRaw={db.movimientos} onLogin={setSession}/>
        : session.type === "farmer" && session.data
          ? <FarmerApp farmer={session.data} premios={db.premios} onLogout={()=>setSession(null)}/>
          : <AdminApp farmersRaw={db.farmers} movimientosRaw={db.movimientos} premios={db.premios} rawDebug={db} onRefresh={cargarDatos} onLogout={()=>setSession(null)}/>
      }
    </div>
  );
}
