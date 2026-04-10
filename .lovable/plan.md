

## Excluir tabela `schedule_blocks`

A tabela `schedule_blocks` já teve seus dados migrados para `appointments`. Vamos removê-la.

### Passo único: Migration para dropar a tabela
- Remover as RLS policies da tabela `schedule_blocks`
- Executar `DROP TABLE public.schedule_blocks`
- Remover qualquer referência restante no código (se houver)

### Detalhes técnicos
```sql
DROP POLICY IF EXISTS "Blocks are viewable by everyone" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Professionals can manage own blocks" ON public.schedule_blocks;
DROP TABLE public.schedule_blocks;
```

Nenhum arquivo de código deve precisar de alteração, pois as referências já foram removidas na migração anterior.

