package com.aicrm;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import java.io.IOException;
import java.util.Set;

@Component @Order(1)
public class LocalBoundary implements Filter {
    LocalBoundary(Environment env) {
        if(!"127.0.0.1".equals(env.getProperty("server.address")) ||
           !env.getProperty("spring.datasource.url","").matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/crm_demo") ||
           !"crm_demo".equals(env.getProperty("spring.datasource.username")))
            throw new IllegalStateException("Only loopback synthetic PostgreSQL crm_demo is supported");
    }
    public void doFilter(ServletRequest req,ServletResponse res,FilterChain chain) throws IOException,ServletException {
        var r=(HttpServletRequest)req;var out=(HttpServletResponse)res;
        out.setHeader("Cache-Control","no-store");out.setHeader("X-Content-Type-Options","nosniff");
        out.setHeader("Referrer-Policy","no-referrer");
        String host=r.getHeader("Host"),origin=r.getHeader("Origin");
        Set<String> hosts=Set.of("127.0.0.1:8787","localhost:8787","127.0.0.1:5173","localhost:5173");
        if(!hosts.contains(host==null?"":host) || (origin!=null && !Set.of("http://127.0.0.1:8787","http://localhost:8787","http://127.0.0.1:5173","http://localhost:5173").contains(origin))) {
            out.setStatus(403);out.setContentType("application/json");out.getWriter().write("{\"code\":\"LOCAL_ORIGIN_REQUIRED\",\"message\":\"Local demo only\"}");return;
        }
        if(r.getContentLengthLong()>16384) {out.sendError(413);return;}
        // Bound streamed/chunked bodies too; reject instead of buffering unbounded input.
        if(r.getContentLengthLong()<0 && Set.of("POST","PUT").contains(r.getMethod())) {out.sendError(411);return;}
        chain.doFilter(req,res);
    }
}
