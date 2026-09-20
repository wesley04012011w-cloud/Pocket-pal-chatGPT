package dev.pocketpal.local;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
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
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;

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
  public void modelPicked(PluginCall call,ActivityResult result){
    try{
      Intent data=result.getData();
      if(data==null||data.getData()==null){call.reject("No file selected");return;}
      Uri uri=data.getData();
      try{getActivity().getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Throwable ignored){}
      String name=name(uri);File dir=new File(getContext().getFilesDir(),"models");dir.mkdirs();File out=new File(dir,name);
      try(InputStream in=getContext().getContentResolver().openInputStream(uri);FileOutputStream fos=new FileOutputStream(out)){
        byte[] b=new byte[1024*1024];int n;while((n=in.read(b))>0)fos.write(b,0,n);
      }
      JSObject r=new JSObject();r.put("path",out.getAbsolutePath());r.put("name",name);call.resolve(r);
    }catch(Throwable x){Diagnostic.log("PICK_MODEL_ERROR "+android.util.Log.getStackTraceString(x));call.reject("Model copy failed",new Exception(x));}
  }

  @PluginMethod
  public void listModels(PluginCall call){
    try{
      File dir=new File(getContext().getFilesDir(),"models"); dir.mkdirs();
      com.getcapacitor.JSArray arr=new com.getcapacitor.JSArray();
      File[] files=dir.listFiles();
      if(files!=null) for(File f:files){
        if(!f.isFile()||!f.getName().toLowerCase().endsWith(".gguf")) continue;
        JSObject m=new JSObject();m.put("name",f.getName());m.put("path",f.getAbsolutePath());m.put("bytes",f.length());arr.put(m);
      }
      JSObject out=new JSObject();out.put("models",arr);call.resolve(out);
    }catch(Throwable x){call.reject("Model list failed",new Exception(x));}
  }

  @PluginMethod
  public void unloadModel(PluginCall call){
    try{NativeBridge.nativeFree();call.resolve();}catch(Throwable x){call.reject("Unload failed",new Exception(x));}
  }

  @PluginMethod
  public void downloadModel(PluginCall call){
    String url=call.getString("url"),requestedName=call.getString("name");
    if(url==null||requestedName==null){call.reject("Missing download information");return;}
    String name=requestedName.replaceAll("[^A-Za-z0-9._-]","_");
    Executors.newSingleThreadExecutor().execute(()->{
      File dir=new File(getContext().getFilesDir(),"models");dir.mkdirs();
      File out=new File(dir,name),tmp=new File(dir,name+".part");HttpURLConnection c=null;
      try{
        Diagnostic.log("MODEL download start name="+name+" url="+url);
        c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(20000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(true);c.setRequestProperty("User-Agent","PocketPal Local");c.connect();
        int code=c.getResponseCode();if(code<200||code>=300)throw new java.io.IOException("HTTP "+code);
        long total=c.getContentLengthLong(),done=0,last=-1;
        try(InputStream in=c.getInputStream();FileOutputStream fos=new FileOutputStream(tmp)){
          byte[] b=new byte[1024*1024];int n;
          while((n=in.read(b))!=-1){if(n==0)continue;fos.write(b,0,n);done+=n;long pct=total>0?(done*100/total):-1;if(pct!=last){last=pct;JSObject p=new JSObject();p.put("name",name);p.put("bytes",done);p.put("total",total);p.put("percent",pct);notifyListeners("downloadProgress",p);}}
        }
        if(out.exists()&&!out.delete())throw new java.io.IOException("Could not replace existing model");
        if(!tmp.renameTo(out))throw new java.io.IOException("Could not finalize download");
        JSObject r=new JSObject();r.put("ok",true);r.put("name",name);r.put("path",out.getAbsolutePath());r.put("bytes",out.length());call.resolve(r);Diagnostic.log("MODEL download complete name="+name+" bytes="+out.length());
      }catch(Throwable x){tmp.delete();Diagnostic.log("MODEL download failed "+android.util.Log.getStackTraceString(x));call.reject("Download failed: "+x.getMessage(),new Exception(x));}
      finally{if(c!=null)c.disconnect();}
    });
  }

  @PluginMethod
  public void loadModel(PluginCall call){
    String path=call.getString("path");if(path==null){call.reject("Missing model path");return;}
    int requestedContext=call.getInt("context",4096),threads=call.getInt("threads",4),bt=call.getInt("batchThreads",8),requestedBatch=call.getInt("batch",256);
    File modelFile=new File(path);
    long modelBytes=modelFile.length();
    // Keep the default mobile profile conservative: Q8 GGUFs can use substantial KV-cache RAM.
    int context=Math.min(Math.max(512,requestedContext),4096);
    int batch=Math.min(Math.max(32,requestedBatch),256);
    android.app.ActivityManager am=(android.app.ActivityManager)getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
    if(am!=null){
      android.app.ActivityManager.MemoryInfo mi=new android.app.ActivityManager.MemoryInfo();
      am.getMemoryInfo(mi);
      if(mi.lowMemory || mi.availMem < 900L*1024L*1024L){
        context=Math.min(context,2048);
        batch=Math.min(batch,128);
      }else if(modelBytes > 500L*1024L*1024L){
        context=Math.min(context,3072);
        batch=Math.min(batch,192);
      }
      Diagnostic.log("MODEL profile bytes="+modelBytes+" requestedContext="+requestedContext+" context="+context+" requestedBatch="+requestedBatch+" batch="+batch+" avail="+mi.availMem+" low="+mi.lowMemory);
    }
    boolean flash=call.getBoolean("flashAttention",true),mmap=call.getBoolean("mmap",true),mlock=call.getBoolean("mlock",false);
    final String loadPath=path;
    final int loadContext=context,loadThreads=threads,loadBatchThreads=bt,loadBatch=batch;
    final boolean loadFlash=flash,loadMmap=mmap,loadMlock=mlock;
    Executors.newSingleThreadExecutor().execute(()->{
      Diagnostic.log("MODEL load start path="+loadPath+" context="+loadContext+" batch="+loadBatch);
      boolean ok=NativeBridge.nativeLoad(loadPath,loadContext,loadThreads,loadBatchThreads,loadBatch,loadFlash,loadMmap,loadMlock);
      Diagnostic.log("MODEL load result="+ok);
      JSObject r=new JSObject();r.put("ok",ok);if(ok)r.put("name",new File(path).getName());call.resolve(r);
    });
  }

  @PluginMethod
  public void generate(PluginCall call){
    JSONArray rolesArray=call.getArray("roles"),contentsArray=call.getArray("contents");
    String[] roles=new String[rolesArray.length()],contents=new String[contentsArray.length()];
    try{for(int i=0;i<roles.length;i++)roles[i]=rolesArray.getString(i);for(int i=0;i<contents.length;i++)contents[i]=contentsArray.getString(i);}catch(JSONException x){call.reject("Invalid conversation arrays",x);return;}
    int max=call.getInt("maxTokens",1024),topK=call.getInt("topK",40);
    float temp=call.getDouble("temperature",.7).floatValue(),topP=call.getDouble("topP",.95).floatValue(),minP=call.getDouble("minP",.05).floatValue();
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
  @PluginMethod public void exportLog(PluginCall call){
    try{
      Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.setType("text/plain");i.putExtra(Intent.EXTRA_TITLE,"pocketpal_diagnostics.txt");
      startActivityForResult(call,i,"exportResult");
    }catch(Throwable x){call.reject("Export failed",new Exception(x));}
  }
  @ActivityCallback
  public void exportResult(PluginCall call,ActivityResult result){
    try{
      if(result.getResultCode()!=android.app.Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){call.reject("Export cancelled");return;}
      Diagnostic.copyForExport(getContext(),result.getData().getData());call.resolve();
    }catch(Throwable x){call.reject("Export failed",new Exception(x));}
  }

  private String name(Uri u){
    try(android.database.Cursor c=getContext().getContentResolver().query(u,null,null,null,null)){
      int i=c.getColumnIndex(OpenableColumns.DISPLAY_NAME);if(c.moveToFirst())return c.getString(i);
    }catch(Throwable ignored){}
    return "model.gguf";
  }
}
