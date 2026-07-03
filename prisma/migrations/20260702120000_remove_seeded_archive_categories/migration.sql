DELETE FROM "ArchiveCategory"
WHERE "id" IN (
  'archive_category_artworks',
  'archive_category_promotions',
  'archive_category_advertisements',
  'archive_category_website_data',
  'archive_category_revisions',
  'archive_category_product_renders',
  'archive_category_3d_assets',
  'archive_category_videos',
  'archive_category_documents',
  'archive_category_health_warnings',
  'archive_category_catalogues_flyers',
  'archive_category_exhibition_materials'
);
