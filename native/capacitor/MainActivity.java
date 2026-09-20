package dev.pocketpal.local;

import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle state){
    // Force the no-action-bar theme before BridgeActivity creates the WebView.
    // This prevents the generated Capacitor launch theme from leaving a
    // native white title bar above the dark web UI.
    setTheme(R.style.AppTheme_NoActionBar);
    Diagnostic.init(this);
    Diagnostic.log("BOOT MainActivity.onCreate");
    try{
      if(Diagnostic.getFile()!=null) NativeBridge.nativeSetLogPath(Diagnostic.getFile().getAbsolutePath());
    }catch(Throwable x){Diagnostic.log("BOOT native log setup "+android.util.Log.getStackTraceString(x));}

    // Let Android reserve the status/navigation bar insets for the WebView.
    // The web UI uses fixed headers/drawers/composer, so edge-to-edge here would
    // make those elements render underneath the phone system bars.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    getWindow().setStatusBarColor(Color.rgb(8,10,18));
    getWindow().setNavigationBarColor(Color.rgb(8,10,18));
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
