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
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
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

    private boolean checkGalleryPermissions() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            boolean hasImages = context.checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
            boolean hasSelected = context.checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) == PackageManager.PERMISSION_GRANTED;
            return (hasImages || hasSelected);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return context.checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        } else {
            return context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
    }

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

        boolean isGranted = checkGalleryPermissions();

        if (!isGranted) {
            requestPermissionForAlias(alias, call, "galleryCallback");
        } else {
            performScan(call);
        }
    }

    @PermissionCallback
    private void galleryCallback(PluginCall call) {
        boolean isGranted = checkGalleryPermissions();

        if (isGranted) {
            performScan(call);
        } else {
            call.reject("Gallery scan permission denied.");
        }
    }

    private void performScan(PluginCall call) {
        // Run on a background Thread to prevent UI freezes/ANRs
        new Thread(() -> {
            Context context = getContext();
            Uri queryUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATE_TAKEN,
                "latitude",
                "longitude"
            };

            String sortOrder = MediaStore.Images.Media.DATE_TAKEN + " DESC";
            
            // Limit scanning to the most recent 10,000 photos for deep history
            int maxScanLimit = 10000;

            // Helper class to store intermediate photo meta before parallel EXIF lookup
            class PhotoItem {
                long id;
                long dateTaken;
                double dbLat;
                double dbLng;
                boolean hasDbLocation;
                
                // Outputs resolved during execution
                double finalLat = 0.0;
                double finalLng = 0.0;
                boolean hasLocation = false;
            }

            List<PhotoItem> items = new ArrayList<>();

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

                    do {
                        PhotoItem item = new PhotoItem();
                        item.id = cursor.getLong(idColumn);
                        item.dateTaken = cursor.getLong(dateTakenColumn);

                        if (latColIndex != -1 && lngColIndex != -1) {
                            if (!cursor.isNull(latColIndex) && !cursor.isNull(lngColIndex)) {
                                item.dbLat = cursor.getDouble(latColIndex);
                                item.dbLng = cursor.getDouble(lngColIndex);
                                if (item.dbLat != 0.0 || item.dbLng != 0.0) {
                                    item.hasDbLocation = true;
                                }
                            }
                        }
                        
                        items.add(item);
                        if (items.size() >= maxScanLimit) {
                            break;
                        }
                    } while (cursor.moveToNext());
                }
            } catch (Exception e) {
                Log.e(TAG, "Error querying media provider", e);
                call.reject("Error querying media provider: " + e.getMessage());
                return;
            }

            if (items.isEmpty()) {
                JSObject result = new JSObject();
                result.put("photos", new JSArray());
                call.resolve(result);
                return;
            }

            // Process EXIF metadata extraction in parallel
            int numCores = Runtime.getRuntime().availableProcessors();
            java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newFixedThreadPool(Math.max(2, numCores));
            List<java.util.concurrent.Callable<Void>> tasks = new ArrayList<>();

            for (PhotoItem item : items) {
                tasks.add(() -> {
                    if (item.hasDbLocation) {
                        item.finalLat = item.dbLat;
                        item.finalLng = item.dbLng;
                        item.hasLocation = true;
                    } else {
                        // Fallback to ExifInterface (opens input stream to read EXIF metadata)
                        Uri photoUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, item.id);
                        try {
                            Uri originalUri = photoUri;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                try {
                                    originalUri = MediaStore.setRequireOriginal(photoUri);
                                } catch (Exception e) {
                                    originalUri = photoUri;
                                }
                            }
                            try (InputStream stream = context.getContentResolver().openInputStream(originalUri)) {
                                if (stream != null) {
                                    ExifInterface exif = new ExifInterface(stream);
                                    float[] latLng = new float[2];
                                    if (exif.getLatLong(latLng)) {
                                        item.finalLat = latLng[0];
                                        item.finalLng = latLng[1];
                                        item.hasLocation = true;
                                    }
                                }
                            }
                        } catch (Exception e) {
                            // Silently ignore EXIF read failure for individual photo
                        }
                    }
                    return null;
                });
            }

            try {
                executor.invokeAll(tasks);
                executor.shutdown();
            } catch (InterruptedException e) {
                Log.e(TAG, "Parallel EXIF scanning was interrupted", e);
                call.reject("Scan interrupted: " + e.getMessage());
                return;
            }

            // Build result array preserving the original date sort order
            JSArray photosArray = new JSArray();
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy.MM.dd", Locale.getDefault());

            for (PhotoItem item : items) {
                Uri photoUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, item.id);
                JSObject photoObj = new JSObject();
                photoObj.put("id", "gp_" + item.id);
                photoObj.put("url", photoUri.toString());
                photoObj.put("lat", item.hasLocation ? item.finalLat : 0.0);
                photoObj.put("lng", item.hasLocation ? item.finalLng : 0.0);
                photoObj.put("hasLocation", item.hasLocation);

                String dateStr = item.dateTaken > 0 ? sdf.format(new Date(item.dateTaken)) : sdf.format(new Date());
                photoObj.put("dateString", dateStr);

                photosArray.put(photoObj);
            }

            JSObject result = new JSObject();
            result.put("photos", photosArray);
            call.resolve(result);

        }).start();
    }
}
