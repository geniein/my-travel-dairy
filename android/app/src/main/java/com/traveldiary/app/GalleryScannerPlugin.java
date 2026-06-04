package com.traveldiary.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

@CapacitorPlugin(
    name = "GalleryScanner",
    permissions = {
        @Permission(
            alias = "gallery",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.ACCESS_MEDIA_LOCATION
            }
        ),
        @Permission(
            alias = "gallery_sdk33",
            strings = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.ACCESS_MEDIA_LOCATION
            }
        ),
        @Permission(
            alias = "gallery_sdk34",
            strings = {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
                Manifest.permission.ACCESS_MEDIA_LOCATION
            }
        )
    }
)
public class GalleryScannerPlugin extends Plugin {

    private static final String TAG = "GalleryScannerPlugin";

    @PluginMethod
    public void scanGallery(PluginCall call) {
        String alias;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            alias = "gallery_sdk34";
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            alias = "gallery_sdk33";
        } else {
            alias = "gallery";
        }

        boolean isGranted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            boolean hasImages = getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
            boolean hasSelected = getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) == PackageManager.PERMISSION_GRANTED;
            boolean hasLocation = getContext().checkSelfPermission(Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED;
            isGranted = (hasImages || hasSelected) && hasLocation;
        } else {
            isGranted = getPermissionState(alias) == PermissionState.GRANTED;
        }

        if (!isGranted) {
            requestPermissionForAlias(alias, call, "galleryCallback");
        } else {
            performScan(call);
        }
    }

    @PermissionCallback
    private void galleryCallback(PluginCall call) {
        boolean isGranted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            boolean hasImages = getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
            boolean hasSelected = getContext().checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) == PackageManager.PERMISSION_GRANTED;
            boolean hasLocation = getContext().checkSelfPermission(Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED;
            isGranted = (hasImages || hasSelected) && hasLocation;
        } else {
            String alias = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "gallery_sdk33" : "gallery";
            isGranted = getPermissionState(alias) == PermissionState.GRANTED;
        }

        if (isGranted) {
            performScan(call);
        } else {
            call.reject("Gallery scan permission denied.");
        }
    }

    private void performScan(PluginCall call) {
        // Run on a standard background Thread to prevent UI freezes / ANRs and ensure compatibility
        new Thread(() -> {
            Context context = getContext();
            JSArray photosArray = new JSArray();

            Uri queryUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATE_TAKEN,
                "latitude",
                "longitude"
            };

            String sortOrder = MediaStore.Images.Media.DATE_TAKEN + " DESC";
            
            // Limit scanning to the most recent 500 photos for blazingly fast startup
            int maxScanLimit = 500;
            int scannedCount = 0;

            try (Cursor cursor = context.getContentResolver().query(
                    queryUri,
                    projection,
                    null,
                    null,
                    sortOrder
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                    int dateTakenColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
                    int latColIndex = cursor.getColumnIndex("latitude");
                    int lngColIndex = cursor.getColumnIndex("longitude");

                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy.MM.dd", Locale.getDefault());

                    do {
                        long id = cursor.getLong(idColumn);
                        long dateTaken = cursor.getLong(dateTakenColumn);

                        Uri photoUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);

                        double dbLat = 0.0;
                        double dbLng = 0.0;
                        boolean hasDbLocation = false;
                        if (latColIndex != -1 && lngColIndex != -1) {
                            if (!cursor.isNull(latColIndex) && !cursor.isNull(lngColIndex)) {
                                dbLat = cursor.getDouble(latColIndex);
                                dbLng = cursor.getDouble(lngColIndex);
                                if (dbLat != 0.0 || dbLng != 0.0) {
                                    hasDbLocation = true;
                                }
                            }
                        }

                        float[] latLng = new float[2];
                        boolean hasLocation = false;

                        if (hasDbLocation) {
                            latLng[0] = (float) dbLat;
                            latLng[1] = (float) dbLng;
                            hasLocation = true;
                            Log.d(TAG, "Location found in MediaStore DB for photo ID " + id + ": " + latLng[0] + ", " + latLng[1]);
                        } else {
                            // Fallback to ExifInterface (opens input stream to read EXIF metadata)
                            try {
                                Uri originalUri = photoUri;
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                    try {
                                        originalUri = MediaStore.setRequireOriginal(photoUri);
                                    } catch (Exception e) {
                                        Log.w(TAG, "setRequireOriginal failed for ID " + id + ", falling back to standard URI: " + e.getMessage());
                                        originalUri = photoUri;
                                    }
                                }
                                try (InputStream stream = context.getContentResolver().openInputStream(originalUri)) {
                                    if (stream != null) {
                                        ExifInterface exif = new ExifInterface(stream);
                                        if (exif.getLatLong(latLng)) {
                                            hasLocation = true;
                                            Log.d(TAG, "Location found via EXIF for photo ID " + id + ": " + latLng[0] + ", " + latLng[1]);
                                        }
                                    }
                                }
                            } catch (Exception e) {
                                Log.d(TAG, "Location metadata not found in EXIF/DB for photo ID " + id + ": " + e.getMessage());
                            }
                        }

                        if (hasLocation) {
                            JSObject photoObj = new JSObject();
                            photoObj.put("id", "gp_" + id);
                            photoObj.put("url", photoUri.toString());
                            photoObj.put("lat", latLng[0]);
                            photoObj.put("lng", latLng[1]);

                            String dateStr = dateTaken > 0 ? sdf.format(new Date(dateTaken)) : sdf.format(new Date());
                            photoObj.put("dateString", dateStr);

                            photosArray.put(photoObj);
                        }

                        scannedCount++;
                        if (scannedCount >= maxScanLimit) {
                            break;
                        }

                    } while (cursor.moveToNext());
                }

                JSObject result = new JSObject();
                result.put("photos", photosArray);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "Error scanning gallery database", e);
                call.reject("Error scanning gallery database: " + e.getMessage());
            }
        }).start();
    }
}
