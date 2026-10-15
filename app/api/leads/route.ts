import { env } from 'cloudflare:workers';
import { handleLead } from '../../../server/leads.js';
export async function POST(request: Request) { return handleLead(request, env.DB); }
