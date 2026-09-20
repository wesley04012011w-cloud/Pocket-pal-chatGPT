package dev.pocketpal.local;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class Diagnostic {
  private static File file;
  private static Thread.UncaughtExceptionHandler previous;
  private Diagnostic(){}

  public static synchronized void init(Context c){
    try{
      File root=c.getExternalFilesDir(null);
      if(root==null)root=c.getFilesDir();
      File dir=new File(root,"logs");dir.mkdirs();
      file=new File(dir,"pocketpal_diagnostics.log");
      log("=== SESSION START ===");
      log("app="+c.getPackageName()+" sdk="+Build.VERSION.SDK_INT+" abi="+Build.SUPPORTED_ABIS[0]);
      if(Build.VERSION.SDK_INT>=30){
        List<ApplicationExitInfo> exits=((ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE)).getHistoricalProcessExitReasons(c.getPackageName(),0,5);
        if(!exits.isEmpty()){
          ApplicationExitInfo e=exits.get(0);
          log("PREVIOUS_EXIT reason="+e.getReason()+" status="+e.getStatus()+" description="+e.getDescription());
          if(e.getTraceInputStream()!=null){
            try(InputStream in=e.getTraceInputStream()){
              byte[] b=new byte[8192];int n,total=0;StringBuilder s=new StringBuilder();
              while((n=in.read(b))>0&&total<262144){s.append(new String(b,0,n,StandardCharsets.UTF_8));total+=n;}
              log("PREVIOUS_TRACE\n"+s);
            }catch(Throwable ignored){}
          }
        }
      }
      previous=Thread.getDefaultUncaughtExceptionHandler();
      Thread.setDefaultUncaughtExceptionHandler((t,x)->{log("UNCAUGHT "+t.getName()+"\n"+android.util.Log.getStackTraceString(x));if(previous!=null)previous.uncaughtException(t,x);});
      Thread.setDefaultUncaughtExceptionHandler(Thread.getDefaultUncaughtExceptionHandler());
    }catch(Throwable x){android.util.Log.e("PocketPalDiag","init",x);}
  }

  public static synchronized void log(String s){
    try{
      if(file==null)return;
      try(FileOutputStream o=new FileOutputStream(file,true)){
        o.write(("["+System.currentTimeMillis()+"] "+s+"\n").getBytes(StandardCharsets.UTF_8));
      }
    }catch(Throwable ignored){}
  }

  public static File getFile(){return file;}

  public static void export(Context c){
    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.setType("text/plain");i.putExtra(Intent.EXTRA_TITLE,"pocketpal_diagnostics.txt");
    c.startActivity(i);
  }

  public static String copyForExport(Context c,Uri uri){
    try(InputStream in=new java.io.FileInputStream(file);OutputStream out=c.getContentResolver().openOutputStream(uri)){
      byte[] b=new byte[8192];int n;while((n=in.read(b))>0)out.write(b,0,n);
      return "ok";
    }catch(Throwable x){log("EXPORT_ERROR "+android.util.Log.getStackTraceString(x));return "error";}
  }
}
