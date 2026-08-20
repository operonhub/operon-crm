-- ============================================================
-- SEED ficticio de Operon CRM (fecha ref: 2026-08-05)
-- Idempotente. NO contiene datos reales de clientes.
--
-- Crea 2 fundadores (Santiago, Tomi) — password dev: Operon2026!
-- y el flujo completo: lead -> oportunidad -> ganado -> cliente/proyecto.
-- ============================================================

-- ---------- Fundadores en auth.users ----------
-- Nota: las columnas de token se setean a '' (no NULL); GoTrue falla
-- al escanear NULL en esos campos y devolvería "credenciales inválidas".
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values
(
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated','authenticated','santiago@operon.dev',
  crypt('Operon2026!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Santiago","role":"admin"}'::jsonb,
  '', '', '', '', '', '', '', ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated','authenticated','tomi@operon.dev',
  crypt('Operon2026!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Tomi","role":"admin"}'::jsonb,
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values
(
  gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"santiago@operon.dev","email_verified":true}'::jsonb,
  'email','11111111-1111-1111-1111-111111111111', now(), now(), now()
),
(
  gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"tomi@operon.dev","email_verified":true}'::jsonb,
  'email','22222222-2222-2222-2222-222222222222', now(), now(), now()
)
on conflict do nothing;

-- ---------- Datos de negocio (idempotente) ----------
truncate activities, project_tasks, automations, financial_records, projects, clients,
         opportunities, leads, contacts, campaigns, organizations
  restart identity cascade;

insert into organizations (id,name,website,domain,industry,size,country,city,linkedin,notes,created_by) values
('a0000000-0000-0000-0000-000000000001','Panadería Don Carlos','doncarlos.com.ar','doncarlos.com.ar','Gastronomía','1-10','Argentina','San Luis',null,'Quieren vender online',   '11111111-1111-1111-1111-111111111111'),
('a0000000-0000-0000-0000-000000000002','Estudio Contable Fénix','fenixcontable.com','fenixcontable.com','Servicios profesionales','11-50','Argentina','Córdoba',null,'Carga manual de clientes','22222222-2222-2222-2222-222222222222'),
('a0000000-0000-0000-0000-000000000003','Gimnasio IronFit','ironfit.fit','ironfit.fit','Fitness','1-10','Argentina','Mendoza',null,'Pierden leads de Instagram','11111111-1111-1111-1111-111111111111'),
('a0000000-0000-0000-0000-000000000004','Clínica DentalSonríe','dentalsonrie.com','dentalsonrie.com','Salud','11-50','Argentina','Buenos Aires',null,'CLIENTE ganado',        '22222222-2222-2222-2222-222222222222'),
('a0000000-0000-0000-0000-000000000005','Inmobiliaria Pilar','inmopilar.com.ar','inmopilar.com.ar','Real estate','1-10','Argentina','Pilar',null,'Referido',                    '11111111-1111-1111-1111-111111111111'),
('a0000000-0000-0000-0000-000000000006','EcoMarket','ecomarket.com.ar','ecomarket.com.ar','Retail','11-50','Argentina','Rosario',null,'Scraping Google Maps',                 '22222222-2222-2222-2222-222222222222');

insert into contacts (id,organization_id,full_name,title,email,phone,created_by) values
('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Carlos Gómez','Dueño','carlos@doncarlos.com.ar','+54 266 400 0001','11111111-1111-1111-1111-111111111111'),
('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','Marina Fénix','Socia','marina@fenixcontable.com','+54 351 400 0002','22222222-2222-2222-2222-222222222222'),
('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003','Lucas Ferro','Owner','lucas@ironfit.fit','+54 261 400 0003','11111111-1111-1111-1111-111111111111'),
('c0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000004','Dra. Sofía Ríos','Directora','sofia@dentalsonrie.com','+54 11 4000 0004','22222222-2222-2222-2222-222222222222'),
('c0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000005','Pablo Ruiz','Titular','pablo@inmopilar.com.ar','+54 230 400 0005','11111111-1111-1111-1111-111111111111');

insert into campaigns (id,name,channel,segment,goal,starts_on,created_by) values
('ca000000-0000-0000-0000-000000000001','Outbound PYMEs Cuyo','email','PYMEs Cuyo','Agendar demos','2026-07-15','11111111-1111-1111-1111-111111111111'),
('ca000000-0000-0000-0000-000000000002','Scraping Maps Rosario','scraping','Retail Rosario','Generar leads','2026-07-20','22222222-2222-2222-2222-222222222222');

insert into leads (id,organization_id,contact_id,campaign_id,source,source_url,service_interest,segment,status,owner_id,created_by) values
('1ead0000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-000000000005',null,'referido',null,'landing_page','Inmobiliaria','nuevo','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'),
('1ead0000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000006',null,'ca000000-0000-0000-0000-000000000002','scraping','https://maps.google.com/?q=ecomarket','automation','Retail','nuevo','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222'),
('1ead0000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','ca000000-0000-0000-0000-000000000001','campana',null,'landing_page','Gastronomía','convertido','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'),
('1ead0000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','ca000000-0000-0000-0000-000000000001','campana',null,'automation','Contable','convertido','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222'),
('1ead0000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003',null,'inbound',null,'lead_generation','Fitness','convertido','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111');

insert into opportunities (id,lead_id,organization_id,contact_id,title,stage,service_type,estimated_value,currency,probability,expected_close_date,next_action,next_action_date,owner_id,created_by) values
('0bb00000-0000-0000-0000-000000000001','1ead0000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Landing Panadería Don Carlos','ganado','landing_page',600,'USD',100,'2026-07-30',null,null,'11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'),
('0bb00000-0000-0000-0000-000000000002','1ead0000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','Automatización carga clientes Fénix','diagnostico_propuesta','automation',1200,'USD',60,'2026-08-20','Enviar propuesta técnica','2026-08-05','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222'),
('0bb00000-0000-0000-0000-000000000003','1ead0000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','Gestión de leads IG - IronFit','negociacion','lead_generation',900,'USD',75,'2026-08-15','Llamar para cerrar precio','2026-08-03','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'),
('0bb00000-0000-0000-0000-000000000004',null,'a0000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-000000000005','Sitio web Inmobiliaria Pilar','contactado','landing_page',700,'USD',30,null,null,null,'11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111');

insert into clients (id,organization_id,opportunity_id,status,start_date,owner_id,notes,created_by) values
('c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','0bb00000-0000-0000-0000-000000000001','activo','2026-07-30','11111111-1111-1111-1111-111111111111','Primer cliente de landing','11111111-1111-1111-1111-111111111111');

insert into projects (id,client_id,opportunity_id,name,type,area,engagement_kind,operational_type,status,scope,conversion_goal,owner_id,start_date,due_date,links,created_by) values
('a9000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','0bb00000-0000-0000-0000-000000000001','Landing Don Carlos','landing_page','sites_ecommerce','client','landing comercial','en_progreso','Landing de venta con catálogo y formulario','Pedidos por WhatsApp','11111111-1111-1111-1111-111111111111','2026-08-01','2026-08-20','{"figma":"https://figma.com/demo","staging":"https://doncarlos-staging.vercel.app"}'::jsonb,'11111111-1111-1111-1111-111111111111');

insert into project_tasks (project_id,title,status,priority,owner_id,position,created_by) values
('a9000000-0000-0000-0000-000000000001','Brief aprobado','completada','alta','11111111-1111-1111-1111-111111111111',1,'11111111-1111-1111-1111-111111111111'),
('a9000000-0000-0000-0000-000000000001','Copy / contenido','completada','media','11111111-1111-1111-1111-111111111111',2,'11111111-1111-1111-1111-111111111111'),
('a9000000-0000-0000-0000-000000000001','Diseño','en_progreso','alta','11111111-1111-1111-1111-111111111111',3,'11111111-1111-1111-1111-111111111111'),
('a9000000-0000-0000-0000-000000000001','Desarrollo','pendiente','media','11111111-1111-1111-1111-111111111111',4,'11111111-1111-1111-1111-111111111111'),
('a9000000-0000-0000-0000-000000000001','QA responsive','pendiente','media',null,5,'11111111-1111-1111-1111-111111111111'),
('a9000000-0000-0000-0000-000000000001','Publicación + dominio','pendiente','alta',null,6,'11111111-1111-1111-1111-111111111111');

insert into financial_records (id,record_type,concept,currency,total_amount,paid_amount,due_date,paid_at,client_id,project_id,notes,created_by) values
('f1000000-0000-0000-0000-000000000001','income','Landing Don Carlos — anticipo','USD',600,300,'2026-08-20','2026-08-01','c1000000-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','Saldo contra publicación','11111111-1111-1111-1111-111111111111'),
('f1000000-0000-0000-0000-000000000002','expense','Herramientas operativas','ARS',45000,45000,'2026-08-05','2026-08-05',null,null,'Gasto ficticio para validar el resumen por moneda','11111111-1111-1111-1111-111111111111');

insert into automations (project_id,name,n8n_workflow_id,n8n_url,environment,status,trigger,secret_ref,created_by) values
(null,'Ingesta leads IronFit desde IG','wf_ig_leads_001','https://n8n.operon.dev/workflow/wf_ig_leads_001','produccion','construccion','Webhook IG Lead Ads','n8n_cred:ig_operon','11111111-1111-1111-1111-111111111111');

insert into activities (type,body,opportunity_id,contact_id,due_date,completed,owner_id,created_by) values
('nota','Primer contacto por email, interesado','0bb00000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002',null,true,'22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222'),
('tarea','Preparar propuesta técnica Fénix','0bb00000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','2026-08-05',false,'22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222'),
('llamada','Llamar a Lucas para cerrar precio','0bb00000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','2026-08-03',false,'11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'),
('reunion','Demo agendada con IronFit','0bb00000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','2026-08-06',false,'11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111');
