package dev.pocketpal.local;

import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle state){
    Diagnostic.init(this);
    Diagnostic.log("BOOT MainActivity.onCreate");
    try{
      if(Diagnostic.getFile()!=null) NativeBridge.nativeSetLogPath(Diagnostic.getFile().getAbsolutePath());
    }catch(Throwable x){Diagnostic.log("BOOT native log setup "+android.util.Log.getStackTraceString(x));}

    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    insets.setAppearanceLightStatusBars(false);
    insets.setAppearanceLightNavigationBars(false);
    getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

    registerPlugin(LlamaPlugin.class);
    super.onCreate(state);
    Diagnostic.log("BOOT Capacitor Bridge ready");
  }

  @Override public void onDestroy(){
    Diagnostic.log("=== SESSION DESTROY ===");
    try{NativeBridge.nativeFree();}catch(Throwable x){Diagnostic.log("nativeFree "+android.util.Log.getStackTraceString(x));}
    super.onDestroy();
  }
}
