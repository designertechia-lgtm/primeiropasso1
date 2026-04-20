alter table professionals
  add column if not exists photo_style text not null default 'portrait';
