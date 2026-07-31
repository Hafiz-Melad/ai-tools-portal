function Navbar() {
    return (
        <nav className="w-full border-b border-white/10 bg-black text-white">
            <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">

                <div className="text-2xl font-bold">
                    AI Tools Portal
                </div>

                <div className="hidden md:flex items-center gap-8 text-gray-300">

                    <a href="#" className="hover:text-white">
                        Home
                    </a>

                    <a href="#tools" className="hover:text-white">
                        AI Tools
                    </a>

                    <a href="#pricing" className="hover:text-white">
                        Pricing
                    </a>

                    <a href="/login" className="hover:text-white">
                        Login
                    </a>

                    <button className="bg-white text-black px-5 py-2 rounded-xl font-semibold hover:bg-gray-200">
                        Get Started
                    </button>

                </div>

            </div>
        </nav>
    )
}

export default Navbar