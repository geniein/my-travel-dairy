package com.traveldiary.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GalleryScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
