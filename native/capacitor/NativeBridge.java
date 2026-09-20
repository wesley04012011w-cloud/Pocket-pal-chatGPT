package dev.pocketpal.local;

public final class NativeBridge {
  static{System.loadLibrary("pocketpal_local");}
  private NativeBridge(){}
  public interface TokenCallback{void emit(String text,boolean done);}
  public static native boolean nativeLoad(String path,int nctx,int threads,int batchThreads,int batch,boolean flash,boolean mmap,boolean mlock);
  public static native void nativeStop();
  public static native void nativeFree();
  public static native void nativeSetLogPath(String path);
  public static native boolean nativeGenerateChat(String[] roles,String[] contents,int maxTokens,float temperature,float topP,int topK,float minP,long seed,boolean useJinja,boolean enableThinking,String systemPrompt,TokenCallback callback);
}
