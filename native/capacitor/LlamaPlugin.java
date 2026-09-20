package dev.pocketpal.local;

import android.content.Intent;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.Executors;

@CapacitorPlugin(name="Llama")
public class LlamaPlugin extends Plugin {
  private static final int PICK=9101;

  @PluginMethod
  public void pickModel(PluginCall call){
    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");
    startActivityForResult(call,i,"modelPicked");
  }

  @ActivityCallback
  private void modelPicked(PluginCall call,com.getcapacitor.PluginCallResult result){
    if(result==null){call.reject("No file selected");return;}
  }

  @ActivityCallback
  public void modelPicked(PluginCall call,Intent data){
    try{
      if(data==null||data.getData()==null){call.reject("No file selected");return;}
      Uri uri=data.getData();getActivity().getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
      String name=name(uri);File dir=new File(getContext().getFilesDir(),"models");dir.mkdirs();File out=new File(dir,name);
      try(InputStream in=getContext().getContentResolver().openInputStream(uri);FileOutputStream fos=new FileOutputStream(out)){
        byte[] b=new byte[1024*1024];int n;while((n=in.read(b))>0)fos.write(b,0,n);
      }
      JSObject r=new JSObject();r.put("path",out.getAbsolutePath());r.put("name",name);call.resolve(r);
    }catch(Throwable x){Diagnostic.log("PICK_MODEL_ERROR "+android.util.Log.getStackTraceString(x));call.reject("Model copy failed",x);}
  }

  @PluginMethod
  public void loadModel(PluginCall call){
    String path=call.getString("path");if(path==null){call.reject("Missing model path");return;}
    int context=call.getInt("context",8192),threads=call.getInt("threads",4),bt=call.getInt("batchThreads",8),batch=call.getInt("batch",512);
    boolean flash=call.getBoolean("flashAttention",true),mmap=call.getBoolean("mmap",true),mlock=call.getBoolean("mlock",false);
    Executors.newSingleThreadExecutor().execute(()->{
      Diagnostic.log("MODEL load start path="+path);
      boolean ok=NativeBridge.nativeLoad(path,context,threads,bt,batch,flash,mmap,mlock);
      Diagnostic.log("MODEL load result="+ok);
      JSObject r=new JSObject();r.put("ok",ok);if(ok)r.put("name",new File(path).getName());call.resolve(r);
    });
  }

  @PluginMethod
  public void generate(PluginCall call){
    String[] roles=call.getArray("roles").toStringArray();
    String[] contents=call.getArray("contents").toStringArray();
    int max=call.getInt("maxTokens",1024),topK=call.getInt("topK",40);
    float temp=(float)call.getDouble("temperature",.7),topP=(float)call.getDouble("topP",.95),minP=(float)call.getDouble("minP",.05);
    long seed=call.getLong("seed",-1L);boolean jinja=call.getBoolean("useJinja",true),thinking=call.getBoolean("enableThinking",true);String sys=call.getString("systemPrompt","");
    Executors.newSingleThreadExecutor().execute(()->{
      Diagnostic.log("GENERATION start");
      NativeBridge.TokenCallback cb=(text,done)->{
        JSObject e=new JSObject();e.put("text",text);e.put("done",done);notifyListeners("token",e);
      };
      boolean ok=NativeBridge.nativeGenerateChat(roles,contents,max,temp,topP,topK,minP,seed,jinja,thinking,sys,cb);
      Diagnostic.log("GENERATION return ok="+ok);
      JSObject end=new JSObject();end.put("ok",ok);notifyListeners("generationDone",end);call.resolve(end);
    });
  }

  @PluginMethod public void stop(PluginCall call){NativeBridge.nativeStop();call.resolve();}
  @PluginMethod public void exportLog(PluginCall call){try{Diagnostic.export(getContext());call.resolve();}catch(Throwable x){call.reject("Export failed",x);}}

  private String name(Uri u){
    try(android.database.Cursor c=getContext().getContentResolver().query(u,null,null,null,null)){
      int i=c.getColumnIndex(OpenableColumns.DISPLAY_NAME);if(c.moveToFirst())return c.getString(i);
    }catch(Throwable ignored){}
    return "model.gguf";
  }
}
