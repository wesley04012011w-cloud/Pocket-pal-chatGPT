          #include <jni.h>
          #include <android/log.h>
          #include <atomic>
          #include <mutex>
          #include <string>
          #include <vector>
          #include <algorithm>
          #include <fstream>
          #include <ctime>
          #include <cstdint>
          #include "llama.h"
          #include "common.h"
          #include "chat.h"
          #include "sampling.h"
          #define TAG "PocketPalNative"
          #define LOGE(...) __android_log_print(ANDROID_LOG_ERROR,TAG,__VA_ARGS__)
          static llama_model*g_model=nullptr;static llama_context*g_ctx=nullptr;static common_chat_templates_ptr g_chat_templates=nullptr;static std::mutex g_mutex;static std::atomic<bool> g_stop{false};static std::vector<llama_token> g_cached_prompt_tokens;static bool g_kv_cache_valid=false;static std::string g_kv_cache_type="f16";
static ggml_type kvType(const std::string&s){if(s=="q4_0")return GGML_TYPE_Q4_0;if(s=="q8_0")return GGML_TYPE_Q8_0;return GGML_TYPE_F16;}
          static std::mutex g_log_mutex;static std::string g_log_path;
          static void DLOG(const std::string&s){LOGE("%s",s.c_str());std::lock_guard<std::mutex>lk(g_log_mutex);if(g_log_path.empty())return;std::ofstream f(g_log_path,std::ios::app);if(f)f<<"["<<std::time(nullptr)<<"] "<<s<<"\n";}
          static std::string js(JNIEnv*e,jstring s){if(!s)return"";const char*p=e->GetStringUTFChars(s,nullptr);std::string r=p?p:"";if(p)e->ReleaseStringUTFChars(s,p);return r;}
          static bool emit(JNIEnv*e,jobject cb,jmethodID mid,const std::string&s,std::string&pending,bool thinking=false){
            pending+=s;std::u16string out;size_t i=0;
            while(i<pending.size()){
              const unsigned char c=(unsigned char)pending[i];uint32_t cp=0;int n=0;
              if(c<0x80){cp=c;n=1;}
              else if((c&0xE0)==0xC0){if(i+1>=pending.size())break;cp=c&0x1F;n=2;}
              else if((c&0xF0)==0xE0){if(i+2>=pending.size())break;cp=c&0x0F;n=3;}
              else if((c&0xF8)==0xF0){if(i+3>=pending.size())break;cp=c&0x07;n=4;}
              else{cp=0xFFFD;n=1;}
              if(n>1){
                bool bad=false;for(int k=1;k<n;k++){unsigned char d=(unsigned char)pending[i+k];if((d&0xC0)!=0x80){bad=true;break;}cp=(cp<<6)|(d&0x3F);}
                if(bad){cp=0xFFFD;n=1;}
                else if((n==2&&cp<0x80)||(n==3&&cp<0x800)||(n==4&&cp<0x10000)||cp>0x10FFFF||(cp>=0xD800&&cp<=0xDFFF)){cp=0xFFFD;n=1;}
              }
              if(cp<=0xFFFF)out.push_back((char16_t)cp);
              else{cp-=0x10000;out.push_back((char16_t)(0xD800+(cp>>10)));out.push_back((char16_t)(0xDC00+(cp&0x3FF)));}
              i+=n;
            }
            if(i)pending.erase(0,i);
            if(out.empty())return true;
            jstring x=e->NewString(reinterpret_cast<const jchar*>(out.data()),(jsize)out.size());if(!x)return false;
            e->CallVoidMethod(cb,mid,x,thinking?JNI_TRUE:JNI_FALSE);e->DeleteLocalRef(x);
            if(e->ExceptionCheck()){LOGE("JNI token callback exception");e->ExceptionDescribe();e->ExceptionClear();return false;}return true;
          }
          static bool flushUtf8(JNIEnv*e,jobject cb,jmethodID mid,std::string&pending,bool thinking=false){
            if(pending.empty())return true;std::u16string out;out.push_back((char16_t)0xFFFD);pending.clear();
            jstring x=e->NewString(reinterpret_cast<const jchar*>(out.data()),1);if(!x)return false;
            e->CallVoidMethod(cb,mid,x,thinking?JNI_TRUE:JNI_FALSE);e->DeleteLocalRef(x);
            if(e->ExceptionCheck()){LOGE("JNI final UTF-8 callback exception");e->ExceptionDescribe();e->ExceptionClear();return false;}return true;
          }
          extern "C" JNIEXPORT void JNICALL Java_dev_pocketpal_local_NativeBridge_nativeSetLogPath(JNIEnv*e,jclass,jstring path){std::lock_guard<std::mutex>lk(g_log_mutex);g_log_path=js(e,path);if(!g_log_path.empty()){std::ofstream f(g_log_path,std::ios::app);if(f)f<<"["<<std::time(nullptr)<<"] NATIVE LOG INITIALIZED\n";}}
          extern "C" JNIEXPORT jboolean JNICALL Java_dev_pocketpal_local_NativeBridge_nativeLoad(JNIEnv*e,jclass,jstring path,jint nctx,jint threads,jint bt,jint batch,jboolean flash,jboolean mmap,jboolean mlock,jboolean offloadKQV,jstring kvCacheType){
           std::lock_guard<std::mutex>lk(g_mutex);DLOG("nativeLoad ENTER");g_stop=false;g_kv_cache_valid=false;g_cached_prompt_tokens.clear();g_kv_cache_type=js(e,kvCacheType);if(g_kv_cache_type!="q4_0"&&g_kv_cache_type!="q8_0")g_kv_cache_type="f16";if(g_ctx){llama_free(g_ctx);g_ctx=nullptr;}g_chat_templates.reset();if(g_model){llama_model_free(g_model);g_model=nullptr;}g_kv_cache_valid=false;g_cached_prompt_tokens.clear();llama_backend_init();DLOG("nativeLoad backend initialized");
           llama_model_params mp=llama_model_default_params();mp.n_gpu_layers=0;mp.load_mode=mmap?(mlock?LLAMA_LOAD_MODE_MMAP_MLOCK:LLAMA_LOAD_MODE_MMAP):(mlock?LLAMA_LOAD_MODE_MLOCK:LLAMA_LOAD_MODE_NONE);std::string p=js(e,path);g_model=llama_model_load_from_file(p.c_str(),mp);
           if(!g_model&&mlock){mp.load_mode=mmap?LLAMA_LOAD_MODE_MMAP:LLAMA_LOAD_MODE_NONE;g_model=llama_model_load_from_file(p.c_str(),mp);}if(!g_model){DLOG("nativeLoad model load FAILED");return JNI_FALSE;}
           llama_context_params cp=llama_context_default_params();cp.n_ctx=(uint32_t)std::max(512,(int)nctx);cp.n_batch=(uint32_t)std::max(32,(int)batch);cp.n_ubatch=std::min(cp.n_batch,512u);cp.n_threads=std::max(1,(int)threads);cp.n_threads_batch=std::max(1,(int)bt);cp.flash_attn_type=flash?LLAMA_FLASH_ATTN_TYPE_ENABLED:LLAMA_FLASH_ATTN_TYPE_DISABLED;cp.type_k=kvType(g_kv_cache_type);cp.type_v=kvType(g_kv_cache_type);cp.offload_kqv=offloadKQV;g_ctx=llama_init_from_model(g_model,cp);
           if(!g_ctx){DLOG("nativeLoad context init FAILED");llama_model_free(g_model);g_model=nullptr;return JNI_FALSE;}try{g_chat_templates=common_chat_templates_init(g_model,"");}catch(const std::exception&x){LOGE("chat template init failed: %s",x.what());llama_free(g_ctx);g_ctx=nullptr;llama_model_free(g_model);g_model=nullptr;return JNI_FALSE;}DLOG("nativeLoad SUCCESS");
           return JNI_TRUE;
          }
          extern "C" JNIEXPORT jstring JNICALL Java_dev_pocketpal_local_NativeBridge_nativeTemplate(JNIEnv*e,jclass){std::lock_guard<std::mutex>lk(g_mutex);const char*t=g_model?llama_model_chat_template(g_model,nullptr):nullptr;return e->NewStringUTF(t?t:"");}
          extern "C" JNIEXPORT void JNICALL Java_dev_pocketpal_local_NativeBridge_nativeStop(JNIEnv*,jclass){DLOG("nativeStop");g_stop=true;}
          extern "C" JNIEXPORT void JNICALL Java_dev_pocketpal_local_NativeBridge_nativeFree(JNIEnv*,jclass){DLOG("nativeFree ENTER");std::lock_guard<std::mutex>lk(g_mutex);g_stop=true;if(g_ctx){llama_free(g_ctx);g_ctx=nullptr;}g_chat_templates.reset();if(g_model){llama_model_free(g_model);g_model=nullptr;}g_kv_cache_valid=false;g_cached_prompt_tokens.clear();}
          extern "C" JNIEXPORT jboolean JNICALL Java_dev_pocketpal_local_NativeBridge_nativeGenerateChat(JNIEnv*e,jclass,jobjectArray jr,jobjectArray jc,jint maxTok,jfloat temp,jfloat topP,jint topK,jfloat minP,jfloat repeatPenalty,jint repeatLastN,jlong seed,jboolean useJinja,jboolean enableThinking,jstring jsystem,jobject cb){
           std::lock_guard<std::mutex>lk(g_mutex);DLOG("nativeGenerateChat ENTER");if(!g_model||!g_ctx||!cb){DLOG("nativeGenerateChat invalid state");return JNI_FALSE;}g_stop=false;jclass cls=e->GetObjectClass(cb);jmethodID mid=e->GetMethodID(cls,"emit","(Ljava/lang/String;Z)V");if(!mid){e->DeleteLocalRef(cls);return JNI_FALSE;}
           try{
            std::vector<common_chat_msg>msgs;std::string sys=js(e,jsystem);if(!sys.empty()){common_chat_msg m;m.role="system";m.content=sys;msgs.push_back(m);}jsize n=e->GetArrayLength(jr);
            for(jsize i=0;i<n;i++){jstring r=(jstring)e->GetObjectArrayElement(jr,i),c=(jstring)e->GetObjectArrayElement(jc,i);common_chat_msg m;m.role=js(e,r);m.content=js(e,c);msgs.push_back(m);e->DeleteLocalRef(r);e->DeleteLocalRef(c);}
            common_chat_templates_inputs in;in.messages=msgs;in.add_generation_prompt=true;in.use_jinja=useJinja;in.enable_thinking=enableThinking;in.reasoning_format=COMMON_REASONING_FORMAT_DEEPSEEK;
            common_chat_params formatted=common_chat_templates_apply(g_chat_templates.get(),in);if(formatted.prompt.empty())return JNI_FALSE;const llama_vocab*v=llama_model_get_vocab(g_model);std::vector<llama_token>toks=common_tokenize(v,formatted.prompt,true,true);if(toks.empty())return JNI_FALSE;if((int)toks.size()+2>=(int)llama_n_ctx(g_ctx))return JNI_FALSE;
            llama_memory_t mem=llama_get_memory(g_ctx);
            size_t commonPrefix=0;
            if(mem&&g_kv_cache_valid){
              const size_t maxPrefix=std::min(g_cached_prompt_tokens.size(),toks.size());
              while(commonPrefix<maxPrefix&&g_cached_prompt_tokens[commonPrefix]==toks[commonPrefix])commonPrefix++;
              if(commonPrefix>0)llama_memory_seq_rm(mem,0,(llama_pos)commonPrefix,-1);
              else llama_memory_clear(mem,true);
            }else if(mem)llama_memory_clear(mem,true);
            if(g_kv_cache_valid&&commonPrefix==toks.size()&&toks.size()>0){
              // The retained prompt already owns the correct logits; no prompt prefill is needed.
            }
            common_params_sampling sp;sp.seed=seed<0?LLAMA_DEFAULT_SEED:(uint32_t)seed;sp.temp=std::max(0.0f,(float)temp);sp.top_p=std::clamp((float)topP,0.0f,1.0f);sp.top_k=std::max(0,(int)topK);sp.min_p=std::clamp((float)minP,0.0f,1.0f);sp.penalty_repeat=std::max(1.0f,(float)repeatPenalty);sp.penalty_last_n=std::max(0,(int)repeatLastN);sp.samplers={COMMON_SAMPLER_TYPE_PENALTIES,COMMON_SAMPLER_TYPE_TOP_K,COMMON_SAMPLER_TYPE_TOP_P,COMMON_SAMPLER_TYPE_MIN_P,COMMON_SAMPLER_TYPE_TEMPERATURE};common_sampler*smp=common_sampler_init(g_model,sp);if(!smp)return JNI_FALSE;
            llama_batch b=llama_batch_init((int32_t)std::max<size_t>(1,std::min((size_t)llama_n_batch(g_ctx),toks.size()-commonPrefix)),0,1);int pos=(int)commonPrefix;bool ok=true;
            for(size_t off=commonPrefix;off<toks.size()&&!g_stop;){common_batch_clear(b);int take=(int)std::min((size_t)llama_n_batch(g_ctx),toks.size()-off);for(int i=0;i<take;i++)common_batch_add(b,toks[off+i],pos++,{0},off+i+1==toks.size());if(llama_decode(g_ctx,b)!=0){ok=false;break;}off+=take;}
            if(!ok){llama_batch_free(b);common_sampler_free(smp);return JNI_FALSE;}g_cached_prompt_tokens=toks;g_kv_cache_valid=true;
            if(g_stop){llama_batch_free(b);common_sampler_free(smp);return JNI_TRUE;}
            enum class EndReason { EOG, STOP, LIMIT, CALLBACK, DECODE_ERROR };
            struct ReasoningStream {
              bool enabled=false,active=false,finished=false;
              std::string start,pending;
              std::vector<std::string> ends;
            } reasoning;
            reasoning.enabled=enableThinking&&formatted.supports_thinking&&!formatted.thinking_end_tags.empty();
            reasoning.start=formatted.thinking_start_tag;
            reasoning.ends=formatted.thinking_end_tags;
            reasoning.active=reasoning.enabled&&(reasoning.start.empty()||(!formatted.generation_prompt.empty()&&formatted.generation_prompt.size()>=reasoning.start.size()&&formatted.generation_prompt.rfind(reasoning.start)==formatted.generation_prompt.size()-reasoning.start.size()));
            std::string utf8Pending;
            auto feedReasoning=[&](const std::string&piece)->bool{
              if(!reasoning.enabled)return emit(e,cb,mid,piece,utf8Pending,false);
              reasoning.pending+=piece;
              while(true){
                if(reasoning.finished){
                  if(!reasoning.pending.empty()&&!emit(e,cb,mid,reasoning.pending,utf8Pending,false))return false;
                  reasoning.pending.clear();return true;
                }
                if(!reasoning.active){
                  const size_t p=reasoning.start.empty()?std::string::npos:reasoning.pending.find(reasoning.start);
                  if(p==std::string::npos){
                    const size_t keep=reasoning.start.empty()?0:reasoning.start.size()-1;
                    if(reasoning.pending.size()>keep){
                      const size_t safe=reasoning.pending.size()-keep;
                      if(!emit(e,cb,mid,reasoning.pending.substr(0,safe),utf8Pending,false))return false;
                      reasoning.pending.erase(0,safe);
                    }
                    return true;
                  }
                  if(p>0&&!emit(e,cb,mid,reasoning.pending.substr(0,p),utf8Pending,false))return false;
                  reasoning.pending.erase(0,p+reasoning.start.size());
                  reasoning.active=true;continue;
                }
                size_t endPos=std::string::npos,endLen=0;
                for(const auto&end:reasoning.ends){if(end.empty())continue;const size_t p=reasoning.pending.find(end);if(p!=std::string::npos&&(endPos==std::string::npos||p<endPos)){endPos=p;endLen=end.size();}}
                if(endPos!=std::string::npos){
                  if(!emit(e,cb,mid,reasoning.pending.substr(0,endPos),utf8Pending,true))return false;
                  reasoning.pending.erase(0,endPos+endLen);reasoning.active=false;reasoning.finished=true;continue;
                }
                size_t maxEnd=1;for(const auto&end:reasoning.ends)maxEnd=std::max(maxEnd,end.size());
                const size_t keep=maxEnd-1;
                if(reasoning.pending.size()>keep){
                  const size_t safe=reasoning.pending.size()-keep;
                  if(!emit(e,cb,mid,reasoning.pending.substr(0,safe),utf8Pending,true))return false;
                  reasoning.pending.erase(0,safe);
                }
                return true;
              }
            };
            EndReason reason=EndReason::LIMIT;
            for(int step=0;step<std::max(1,(int)maxTok);step++){
              if(g_stop){reason=EndReason::STOP;break;}
              llama_token tok=common_sampler_sample(smp,g_ctx,-1);
              if(llama_vocab_is_eog(v,tok)){
                DLOG(std::string("generation: EOG token=")+std::to_string((int)tok));
                reason=EndReason::EOG;
                g_stop=true;
                break;
              }
              common_sampler_accept(smp,tok,true);
              std::string piece=common_token_to_piece(v,tok,true);
              if(!piece.empty()&&!feedReasoning(piece)){reason=EndReason::CALLBACK;break;}
              common_batch_clear(b);
              common_batch_add(b,tok,pos++,{0},true);
              if(llama_decode(g_ctx,b)!=0){reason=EndReason::DECODE_ERROR;break;}
            }
            if(reasoning.enabled&&!reasoning.pending.empty()){
              if(!emit(e,cb,mid,reasoning.pending,utf8Pending,reasoning.active&&!reasoning.finished))reason=EndReason::CALLBACK;
              reasoning.pending.clear();
            }
            if(!utf8Pending.empty()&&!flushUtf8(e,cb,mid,utf8Pending,reasoning.active&&!reasoning.finished)){reason=EndReason::CALLBACK;}
            DLOG(std::string("generation: terminal cleanup begin reason=")+
                 (reason==EndReason::EOG?"EOG":
                  reason==EndReason::STOP?"STOP":
                  reason==EndReason::LIMIT?"LIMIT":
                  reason==EndReason::CALLBACK?"CALLBACK":"DECODE_ERROR"));
            DLOG("generation: before batch_free");
            llama_batch_free(b);
            DLOG("generation: after batch_free");
            DLOG("generation: before sampler_free");
            common_sampler_free(smp);
            DLOG("generation: after sampler_free");
            DLOG("generation: before DeleteLocalRef");
            e->DeleteLocalRef(cls);
            DLOG("generation: after DeleteLocalRef");
            g_stop=false;
            DLOG("generation: returning JNI_TRUE");
            return reason==EndReason::DECODE_ERROR?JNI_FALSE:JNI_TRUE;
           }catch(const std::exception&x){DLOG(std::string("generation EXCEPTION: ")+x.what());return JNI_FALSE;}catch(...){DLOG("generation UNKNOWN EXCEPTION");return JNI_FALSE;}
          }
