# 多阶段构建：仅保留 JRE 运行层，减小攻击面与镜像体积
FROM maven:3.9-eclipse-temurin-17-alpine AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S tcm && adduser -S tcm -G tcm
USER tcm
WORKDIR /app
COPY --from=build /src/target/tcm-inquiry-backend-*.jar /app/app.jar
EXPOSE 8080
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
