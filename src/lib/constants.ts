import type { Enums } from "./supabase/types"

// ---------- Etapas de oportunidad (pipeline) ----------
export const OPPORTUNITY_STAGES: Enums<"opportunity_stage">[] = [
  "nuevo",
  "por_investigar",
  "contactado",
  "respondio",
  "reunion_agendada",
  "diagnostico_propuesta",
  "negociacion",
  "ganado",
  "perdido",
  "no_califica",
]

export const STAGE_LABELS: Record<Enums<"opportunity_stage">, string> = {
  nuevo: "Nuevo",
  por_investigar: "Por investigar",
  contactado: "Contactado",
  respondio: "Respondió",
  reunion_agendada: "Reunión agendada",
  diagnostico_propuesta: "Diagnóstico / propuesta",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
  no_califica: "No califica",
}

/** Etapas activas: requieren próxima acción y viven en el Kanban. */
export const ACTIVE_STAGES: Enums<"opportunity_stage">[] = [
  "nuevo",
  "por_investigar",
  "contactado",
  "respondio",
  "reunion_agendada",
  "diagnostico_propuesta",
  "negociacion",
]

export const CLOSED_STAGES: Enums<"opportunity_stage">[] = [
  "ganado",
  "perdido",
  "no_califica",
]

export function isActiveStage(stage: Enums<"opportunity_stage">) {
  return ACTIVE_STAGES.includes(stage)
}

// ---------- Fuentes de lead ----------
export const LEAD_SOURCE_LABELS: Record<Enums<"lead_source">, string> = {
  scraping: "Scraping",
  lista_manual: "Lista manual",
  referido: "Referido",
  formulario: "Formulario",
  campana: "Campaña",
  inbound: "Inbound",
  n8n: "n8n",
  otro: "Otro",
}

export const LEAD_STATUS_LABELS: Record<Enums<"lead_status">, string> = {
  nuevo: "Nuevo",
  calificado: "Calificado",
  descartado: "Descartado",
  convertido: "Convertido",
}

// ---------- Tipos de servicio ----------
export const SERVICE_TYPE_LABELS: Record<Enums<"service_type">, string> = {
  landing_page: "Landing page",
  automation: "Automatización",
  lead_generation: "Generación de leads",
  package: "Paquete legado",
}

/** `package` se conserva por compatibilidad, pero no se ofrece en altas nuevas. */
export const PROJECT_TEMPLATE_TYPES: Enums<"service_type">[] = [
  "landing_page",
  "automation",
  "lead_generation",
]

// ---------- Actividades ----------
export const ACTIVITY_TYPE_LABELS: Record<Enums<"activity_type">, string> = {
  nota: "Nota",
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  tarea: "Tarea",
}

// ---------- Proyectos ----------
export const PROJECT_AREAS = [
  "sites_ecommerce",
  "apps_saas",
  "automations_crm",
  "assets_brand",
] as const

export type ProjectArea = (typeof PROJECT_AREAS)[number]

export const PROJECT_AREA_LABELS: Record<ProjectArea, string> = {
  sites_ecommerce: "Sites & Ecommerce",
  apps_saas: "Apps & SaaS",
  automations_crm: "Automatizaciones & CRM",
  assets_brand: "Activos Digitales & Marca",
}

export const PROJECT_AREA_DESCRIPTIONS: Record<ProjectArea, string> = {
  sites_ecommerce: "Sitios, tiendas y experiencias de venta",
  apps_saas: "Productos de software propios y para clientes",
  automations_crm: "Flujos, agentes, CRM y operación con n8n",
  assets_brand: "Contenido, SEO, marca y activos de audiencia",
}

export const PROJECT_ENGAGEMENT_LABELS = {
  client: "Para cliente",
  internal: "Interno",
} as const

export type ProjectEngagement = keyof typeof PROJECT_ENGAGEMENT_LABELS

/** Estados de proyecto que siguen en curso (aparecen en el panel operativo). */
export const ACTIVE_PROJECT_STATUSES: Enums<"project_status">[] = [
  "discovery",
  "en_progreso",
  "revision",
  "activo",
]

export const PROJECT_STATUS_LABELS: Record<Enums<"project_status">, string> = {
  discovery: "Discovery",
  en_progreso: "En progreso",
  revision: "Revisión cliente",
  entregado: "Entregado",
  activo: "Activo",
  pausado: "Pausado",
  cerrado: "Cerrado",
}

export const TASK_STATUS_LABELS: Record<Enums<"task_status">, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  bloqueada: "Bloqueada",
  completada: "Completada",
}

export const PRIORITY_LABELS: Record<Enums<"priority_level">, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
}

export const CLIENT_STATUS_LABELS: Record<Enums<"client_status">, string> = {
  activo: "Activo",
  pausado: "Pausado",
  finalizado: "Finalizado",
}

export const AUTOMATION_STATUS_LABELS: Record<
  Enums<"automation_status">,
  string
> = {
  discovery: "Discovery",
  construccion: "Construcción",
  activo: "Activo",
  pausado: "Pausado",
  monitoreo: "Monitoreo",
}

// ---------- Finanzas operativas ----------
export const FINANCIAL_RECORD_TYPE_LABELS = {
  income: "Ingreso",
  expense: "Gasto",
} as const

export type FinancialRecordType = keyof typeof FINANCIAL_RECORD_TYPE_LABELS

export const FINANCIAL_STATUS_LABELS = {
  pending: "Pendiente",
  partial: "Parcial",
  paid: "Cobrado",
  overdue: "Vencido",
  cancelled: "Cancelado",
} as const

export type FinancialStatus = keyof typeof FINANCIAL_STATUS_LABELS

export const SUPPORTED_CURRENCIES = ["ARS", "USD"] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

// ---------- Plantillas de checklist por tipo de proyecto ----------
export const PROJECT_TASK_TEMPLATES: Record<
  Enums<"service_type">,
  { title: string; priority: Enums<"priority_level"> }[]
> = {
  landing_page: [
    { title: "Brief aprobado", priority: "alta" },
    { title: "Copy / contenido", priority: "media" },
    { title: "Diseño", priority: "alta" },
    { title: "Desarrollo", priority: "alta" },
    { title: "QA responsive", priority: "media" },
    { title: "Formulario / CRM conectado", priority: "media" },
    { title: "Analytics / pixel", priority: "media" },
    { title: "Dominio configurado", priority: "media" },
    { title: "Publicación", priority: "alta" },
    { title: "Handoff al cliente", priority: "media" },
  ],
  automation: [
    { title: "Alcance definido", priority: "alta" },
    { title: "Fuentes de leads identificadas", priority: "alta" },
    { title: "Normalización / deduplicación", priority: "media" },
    { title: "Enriquecimiento de datos", priority: "media" },
    { title: "Destino en CRM", priority: "alta" },
    { title: "Alertas configuradas", priority: "media" },
    { title: "Pruebas end-to-end", priority: "alta" },
    { title: "Handoff y documentación", priority: "media" },
    { title: "Monitoreo activo", priority: "media" },
  ],
  lead_generation: [
    { title: "ICP y segmento definido", priority: "alta" },
    { title: "Fuentes de prospección", priority: "alta" },
    { title: "Mensajería / secuencia", priority: "media" },
    { title: "Deduplicación de leads", priority: "media" },
    { title: "Carga en CRM", priority: "alta" },
    { title: "Reporte de resultados", priority: "media" },
  ],
  package: [
    { title: "Alcance del paquete", priority: "alta" },
    { title: "Kickoff con cliente", priority: "alta" },
    { title: "Entregable 1", priority: "media" },
    { title: "Entregable 2", priority: "media" },
    { title: "Handoff final", priority: "media" },
  ],
}
