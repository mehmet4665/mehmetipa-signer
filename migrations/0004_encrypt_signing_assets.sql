-- Store the AES-GCM IVs required to decrypt encrypted certificate assets.
ALTER TABLE signing_certificate ADD COLUMN p12_iv TEXT;
ALTER TABLE signing_certificate ADD COLUMN profile_iv TEXT;
