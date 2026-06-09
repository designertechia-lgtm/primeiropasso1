import { createClient } from 'npm:@supabase/supabase-js@2';
import OpenAI from 'npm:openai';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
Deno.serve(async (req)=>{
  // Grab the user's query from the JSON payload
  const { query } = await req.json();
  // Instantiate OpenAI client
  const openai = new OpenAI({
    apiKey: openaiApiKey
  });
  // Generate a one-time embedding for the user's query
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536
  });
  const [{ embedding }] = embeddingResponse.data;
  // Instantiate the Supabase client
  // (replace service role key with user's JWT if using Supabase auth and RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  // Call hybrid_search Postgres function via RPC
  const { data: documents } = await supabase.rpc('hybrid_search', {
    query_text: query,
    query_embedding: embedding,
    match_count: 10 // Quantidade de respostas relevantes que sua LLM vai receber, mude caso queira que ela receba mais ou menos respostas.
  });
  return new Response(JSON.stringify(documents), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
