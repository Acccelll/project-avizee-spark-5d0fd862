
ALTER TABLE notas_fiscais_itens DISABLE TRIGGER trg_nf_itens_protege_edicao;

UPDATE notas_fiscais_itens SET produto_id = 'cb86355e-a166-421e-8a2c-295ed16e3fef' WHERE produto_id = '1f80ffc3-b61f-43fd-ab7b-fbb29d341240';
UPDATE notas_fiscais_itens SET produto_id = '7bbe1e2d-4784-494d-aa16-d1c547cecf06' WHERE produto_id = 'f7e98b09-7e7a-4dd8-bda7-1e1ec9184b4e';
UPDATE notas_fiscais_itens SET produto_id = 'c3f659cb-2784-40a1-a094-be786686b330' WHERE produto_id = 'a819604a-904f-4c0e-b91b-8558b5167a01';
UPDATE notas_fiscais_itens SET produto_id = '4a6cd71c-2059-4374-bb17-92824898c27c' WHERE produto_id = '6cf0b069-0460-4262-a32f-83e2414b421b';
UPDATE notas_fiscais_itens SET produto_id = '70dddb30-d834-4482-8041-9c1fb13d8f97' WHERE produto_id = '87ef1c96-52cf-41a2-932d-cfc237c0c3c4';
UPDATE notas_fiscais_itens SET produto_id = 'bd08ad72-d51a-40da-8a58-cab2d721a8e5' WHERE produto_id = 'a1cd0aa3-5275-4e26-95b7-ab33e8b4d199';
UPDATE notas_fiscais_itens SET produto_id = '55384a2a-2369-4cf5-b0f4-30800a483244' WHERE produto_id = 'e99e7c4b-8344-4861-818a-e6c789b41587';
UPDATE notas_fiscais_itens SET produto_id = 'cbff5649-a706-4919-af77-fd3c93fa78b1' WHERE produto_id = 'cbc9fcdb-28cc-4a75-a6d5-ef075fe5a7e5';

ALTER TABLE notas_fiscais_itens ENABLE TRIGGER trg_nf_itens_protege_edicao;

DELETE FROM produtos WHERE id IN (
  '1f80ffc3-b61f-43fd-ab7b-fbb29d341240',
  'f7e98b09-7e7a-4dd8-bda7-1e1ec9184b4e',
  'a819604a-904f-4c0e-b91b-8558b5167a01',
  '6cf0b069-0460-4262-a32f-83e2414b421b',
  '87ef1c96-52cf-41a2-932d-cfc237c0c3c4',
  'a1cd0aa3-5275-4e26-95b7-ab33e8b4d199',
  'e99e7c4b-8344-4861-818a-e6c789b41587',
  'cbc9fcdb-28cc-4a75-a6d5-ef075fe5a7e5'
);
