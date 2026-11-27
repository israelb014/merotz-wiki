package com.ibfix.merotzwiki;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        CrashReporter.install(this); // global native crash handler → ntfy.sh (see CrashReporter)
        super.onCreate(savedInstanceState);
    }
}
