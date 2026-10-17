package com.aicrm;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        // This build deliberately cannot be selected as a production deployment.
        if (!"synthetic".equals(System.getenv().getOrDefault("CRM_MODE", "synthetic"))) {
            throw new IllegalStateException("Only the local synthetic environment is implemented");
        }
        SpringApplication.run(Application.class, args);
    }
}
