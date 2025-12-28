import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import VoicePanel from "@/components/VoicePanel";
import ChatInput from "@/components/ChatInput";

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <Header />
      
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />
        
        {/* Center Chat Area */}
        <div className="flex flex-1 flex-col">
          <ChatArea />
          <ChatInput />
        </div>
        
        {/* Right Voice Panel */}
        <VoicePanel />
      </div>
    </div>
  );
}

