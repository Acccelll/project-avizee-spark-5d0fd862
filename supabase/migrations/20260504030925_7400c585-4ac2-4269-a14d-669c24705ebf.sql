-- Etapa 3: padronização de policies do bucket dbavizee.
-- Remove duplicatas legadas e estabelece prefixos canônicos.

-- Drop legacy permissive policies (ignoravam foldername)
DROP POLICY IF EXISTS dbavizee_auth_read ON storage.objects;
DROP POLICY IF EXISTS dbavizee_auth_insert ON storage.objects;
DROP POLICY IF EXISTS dbavizee_auth_update ON storage.objects;
DROP POLICY IF EXISTS dbavizee_auth_delete ON storage.objects;
DROP POLICY IF EXISTS dbavizee_auth_upload ON storage.objects;

-- Drop policies user-scoped (incompatíveis com paths atuais por prefixo)
DROP POLICY IF EXISTS dbavizee_select ON storage.objects;
DROP POLICY IF EXISTS dbavizee_insert ON storage.objects;
DROP POLICY IF EXISTS dbavizee_update ON storage.objects;
DROP POLICY IF EXISTS dbavizee_delete ON storage.objects;

-- Prefixos canônicos compartilhados: templates, apresentacoes, workbooks, fiscal
-- Mais espaço pessoal por usuário: users/{auth.uid()}/...
-- Admin tem acesso total.

CREATE POLICY dbavizee_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'dbavizee' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] IN ('templates','apresentacoes','workbooks','fiscal')
    OR (storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text
  )
);

CREATE POLICY dbavizee_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dbavizee' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] IN ('templates','apresentacoes','workbooks','fiscal')
    OR ((storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text)
  )
);

CREATE POLICY dbavizee_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'dbavizee' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] IN ('templates','apresentacoes','workbooks','fiscal')
    OR ((storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text)
  )
);

CREATE POLICY dbavizee_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'dbavizee' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (storage.foldername(name))[1] IN ('apresentacoes','workbooks')
    OR ((storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text)
  )
);
-- Nota: delete em 'templates' e 'fiscal' é restrito a admin (mais sensível).