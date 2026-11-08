import {AtlasError} from './errors.mjs';

/** First numbered schema: current on-disk shape plus schemaVersion. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Schemas this app build can read and write after migration. */
export const SUPPORTED_SCHEMAS = Object.freeze([1]);

export const DATA_DIRS = Object.freeze(['docs', 'uploads', 'history']);

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'dark',
  leftWidth: 265,
  rightWidth: 335,
  pinnedFolders: [],
  hiddenFolders: [],
  keymap: {},
});

export function emptyDatabase(schemaVersion = CURRENT_SCHEMA_VERSION) {
  return {
    schemaVersion,
    assets: [],
    folders: [],
    comments: [],
    navigationOrder: {},
    settings: {...DEFAULT_SETTINGS},
  };
}

export function isSupportedSchema(version) {
  return SUPPORTED_SCHEMAS.includes(version);
}

/**
 * Structural check for a library database object.
 * Does not require schemaVersion (legacy libraries omit it).
 */
export function assertDatabaseShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AtlasError('library.dbInvalid', 'Library database is not a valid object.');
  }
  const db = value;
  if (!Array.isArray(db.comments) || !Array.isArray(db.folders) || !Array.isArray(db.assets)) {
    throw new AtlasError('library.dbInvalid', 'Library database is missing required arrays.');
  }
  if (db.navigationOrder != null && (typeof db.navigationOrder !== 'object' || Array.isArray(db.navigationOrder))) {
    throw new AtlasError('library.dbInvalid', 'Library navigationOrder must be an object.');
  }
  if (db.settings != null && (typeof db.settings !== 'object' || Array.isArray(db.settings))) {
    throw new AtlasError('library.dbInvalid', 'Library settings must be an object.');
  }
  if (db.schemaVersion != null) {
    if (!Number.isInteger(db.schemaVersion) || db.schemaVersion < 1) {
      throw new AtlasError('library.dbInvalid', 'schemaVersion must be a positive integer.');
    }
  }
  for (const asset of db.assets) {
    if (!asset || typeof asset !== 'object') throw new AtlasError('library.dbInvalid', 'Invalid asset record.');
    if (typeof asset.id !== 'string' || typeof asset.storedName !== 'string') {
      throw new AtlasError('library.dbInvalid', 'Asset records need id and storedName.');
    }
    if (!asset.storedName || asset.storedName.includes('/') || asset.storedName.includes('\\') || asset.storedName.includes('..') || asset.storedName.startsWith('.')) {
      throw new AtlasError('library.attachmentLink', 'Attachment storedName is unsafe.');
    }
  }
  for (const folder of db.folders) {
    if (!folder || typeof folder !== 'object') throw new AtlasError('library.dbInvalid', 'Invalid folder record.');
    if (typeof folder.path !== 'string' || folder.path.includes('..') || folder.path.includes('\\')) {
      throw new AtlasError('library.folderLink', 'Folder path is unsafe.');
    }
    if (folder.imageId != null && typeof folder.imageId !== 'string') {
      throw new AtlasError('library.coverLink', 'Folder cover imageId must be a string or null.');
    }
  }
  for (const comment of db.comments) {
    if (!comment || typeof comment !== 'object') throw new AtlasError('library.dbInvalid', 'Invalid comment record.');
    if (typeof comment.content !== 'string' || typeof comment.docId !== 'string') {
      throw new AtlasError('library.commentLink', 'Comment records need content and docId.');
    }
  }
  return db;
}

export function readSchemaVersion(db) {
  if (db.schemaVersion == null) return null;
  return db.schemaVersion;
}
