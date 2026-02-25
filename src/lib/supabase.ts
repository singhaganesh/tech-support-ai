import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Force IPv4 + Google DNS (local DNS server refuses *.supabase.co)
dns.setDefaultResultOrder('ipv4first');

const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);

// Custom DNS lookup using Google DNS
function customLookup(hostname: string, _opts: any, cb: Function) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}

// Agent with custom DNS + IPv4
const agent = new Agent({
    connect: {
        family: 4,
        lookup: customLookup as any,
    },
});

// Custom fetch using our agent
const customFetch = (input: any, init?: any) => {
    return undiciFetch(input, {
        ...init,
        dispatcher: agent,
    }) as unknown as Promise<Response>;
};

// Create Supabase client with our custom networking
export function getSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: { persistSession: false },
            global: { fetch: customFetch as any },
        }
    );
}

// Export for use in scripts
export { customFetch };
