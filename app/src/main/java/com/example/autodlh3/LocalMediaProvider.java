package com.example.autodlh3;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class LocalMediaProvider extends ContentProvider {
    private static final String AUTHORITY = "com.example.autodlh3.localmedia";

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) {
        return resolveFile(uri).getName().toLowerCase().endsWith(".mp4") ? "video/mp4" : null;
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file = resolveFile(uri);
        if (!file.exists() || !file.isFile()) return null;
        MatrixCursor cursor = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        cursor.addRow(new Object[]{file.getName(), file.length()});
        return cursor;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("只读媒体 URI");
        return ParcelFileDescriptor.open(resolveFile(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
    @Override public Uri insert(Uri uri, ContentValues values) { return null; }

    private File resolveFile(Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null || !name.toLowerCase().endsWith(".mp4") || !name.matches("[A-Za-z0-9._-]+")) {
            throw new IllegalArgumentException("非法媒体文件名");
        }
        File root = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "AutoDL-H3");
        File file = new File(root, name);
        try {
            if (!file.getCanonicalFile().getParentFile().equals(root.getCanonicalFile())) {
                throw new IllegalArgumentException("非法媒体路径");
            }
        } catch (java.io.IOException error) {
            throw new IllegalArgumentException("无法解析媒体路径", error);
        }
        return file;
    }
}
