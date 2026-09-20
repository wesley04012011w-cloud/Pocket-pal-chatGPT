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

    // Immersive fullscreen: the chat owns the entire display. The floating web
    // controls are intentionally positioned inside this fullscreen canvas.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    getWindow().getDecorView().setSystemUiVisibility(
      android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
      | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
      | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    );
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
