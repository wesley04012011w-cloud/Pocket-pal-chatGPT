package dev.pocketpal.local;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle state){
    Diagnostic.init(this);
    Diagnostic.log("BOOT MainActivity.onCreate");
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
